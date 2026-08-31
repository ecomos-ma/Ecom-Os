import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Loader2, ScanLine, AlertCircle, CheckCircle, Package, User, Phone, MapPin, Box, RotateCcw, Truck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { isReturnableStatus, loadOrderItems, executeReturnToStock, type ReturnItem, type ReturnToStockResult } from "../../lib/returnToStock";
import { StatusBadge } from "../StatusBadge";
import { ShippingStatusBadge } from "../ShippingStatusBadge";

interface InventoryQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onQRDetected: (qrValue: string) => void;
  onViewOrder?: (orderId: string) => void;
}

interface OrderResult {
  "Order ID": string;
  order_number: string;
  tracking_number: string | null;
  coliaty_parcel_code: string | null;
  customer_name: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  shipping_status: string | null;
  created_at: string;
  returned_to_stock: boolean;
  sku: string | null;
  quantity: number | null;
  product_variant: string | null;
}

export function InventoryQRScanner({ isOpen, onClose, onQRDetected, onViewOrder }: InventoryQRScannerProps) {
  const { workspace } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [detectedValue, setDetectedValue] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [autoReturnToStock, setAutoReturnToStock] = useState(false);
  const [isReturningToStock, setIsReturningToStock] = useState(false);
  const [returnToStockResult, setReturnToStockResult] = useState<ReturnToStockResult | null>(null);
  const [returnedToStockSuccess, setReturnedToStockSuccess] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  // Central reset function - clears all state for a fresh scan
  const resetScannerState = useCallback(() => {
    console.log("[InventoryQRScanner] Resetting scanner state for fresh scan");
    
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear all scan/result state IMMEDIATELY
    setDetectedValue(null);
    setOrderResult(null);
    setNotFound(false);
    setDbError(null);
    setCameraError(null);
    setReturnToStockResult(null);
    setReturnedToStockSuccess(false);
    setLoading(false);
    setIsReturningToStock(false);
    setScanning(false);
    setCameraActive(false);
    
    // Reset processing flag - this is critical for allowing next QR detection
    isProcessingRef.current = false;
  }, []);

  // Helper: Check if order is already returned to stock
  const isAlreadyReturnedToStock = useCallback((order: OrderResult) => {
    // Only check the returned_to_stock field - shipping status must NOT be used for this
    return order.returned_to_stock === true;
  }, []);

  // Helper: Check if order is eligible for return to stock
  const isEligibleForReturnToStock = useCallback((order: OrderResult) => {
    // Already returned is not eligible
    if (isAlreadyReturnedToStock(order)) {
      return false;
    }
    
    // Check if status is returnable
    const rawStatus = String(order.shipping_status || order.status || "");
    return isReturnableStatus(rawStatus);
  }, [isAlreadyReturnedToStock]);

  // Load jsQR library
  const loadJsQR = useCallback(async () => {
    if (typeof window !== "undefined" && (window as any).jsQR) {
      return (window as any).jsQR;
    }
    
    // Load from CDN if not available
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      script.onload = () => resolve((window as any).jsQR);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }, []);

  // Lookup order by tracking number
  const handleReturnToStock = useCallback(async (order: OrderResult) => {
    if (!workspace?.id) return;

    setIsReturningToStock(true);
    setReturnToStockResult(null);
    setReturnedToStockSuccess(false);

    try {
      // Check if already returned using helper
      if (isAlreadyReturnedToStock(order)) {
        setReturnToStockResult({
          success: false,
          error: "Already Returned to Stock",
          tracking: order.tracking_number || order.coliaty_parcel_code || order.order_number,
          productName: "Product",
          qty: 0,
          alreadyReturned: true,
        });
        setReturnedToStockSuccess(false);
        setIsReturningToStock(false);
        return;
      }

      // Eligibility check using helper
      if (!isEligibleForReturnToStock(order)) {
        setReturnToStockResult({
          success: false,
          error: "Package is not eligible for Return to Stock",
          tracking: order.tracking_number || order.coliaty_parcel_code || order.order_number,
          productName: "Product",
          qty: 0,
          notEligible: true,
        });
        setReturnedToStockSuccess(false);
        setIsReturningToStock(false);
        return;
      }

      // Load items
      const items = await loadOrderItems(order["Order ID"], order.sku, order.quantity, order.product_variant, workspace.id);

      if (items.length === 0) {
        setReturnToStockResult({
          success: false,
          error: "No products found for this order",
          tracking: order.tracking_number || order.coliaty_parcel_code || order.order_number,
          productName: "Product",
          qty: 0,
        });
        setReturnedToStockSuccess(false);
        return;
      }

      // Execute return
      const tracking = order.tracking_number || order.coliaty_parcel_code || order.order_number;
      const result = await executeReturnToStock(order["Order ID"], items, tracking, workspace.id);

      setReturnToStockResult(result);
      setReturnedToStockSuccess(result.success);

      // Update order result to reflect returned status
      if (result.success) {
        setOrderResult({ ...order, returned_to_stock: true });
      }
    } catch (err: any) {
      console.error("[InventoryQRScanner] Return to stock error:", err);
      setReturnToStockResult({
        success: false,
        error: "Unable to return package to stock.",
        tracking: order.tracking_number || order.coliaty_parcel_code || order.order_number,
        productName: "Product",
        qty: 0,
      });
      setReturnedToStockSuccess(false);
    } finally {
      setIsReturningToStock(false);
    }
  }, [workspace?.id, isAlreadyReturnedToStock, isEligibleForReturnToStock]);

  // Lookup order by tracking number
  const lookupOrder = useCallback(async (trackingValue: string) => {
    if (!workspace?.id) {
      console.error("[InventoryQRScanner] No workspace found");
      setNotFound(true);
      return;
    }

    setLoading(true);
    setOrderResult(null);
    setNotFound(false);
    setDbError(null);

    try {
      console.log("[InventoryQRScanner] Looking up tracking:", trackingValue, "in workspace:", workspace.id);

      // Step 1: Find shipment by tracking_number
      console.log("[QR DEBUG] QUERY STEP 1: shipments lookup");
      console.log("[QR DEBUG] Table: shipments");
      console.log("[QR DEBUG] Columns: order_id, tracking_number");
      console.log("[QR DEBUG] Filter: tracking_number =", trackingValue);
      const { data: shipmentData, error: shipmentError } = await supabase
        .from("shipments")
        .select("order_id, tracking_number")
        .eq("tracking_number", trackingValue)
        .maybeSingle();

      console.log("[QR DEBUG] Shipment query result:", { data: shipmentData, error: shipmentError });

      if (shipmentError) {
        console.error("[QR DEBUG ERROR] SHIPMENT QUERY FAILED:", {
          message: shipmentError.message,
          code: shipmentError.code,
          details: shipmentError.details,
          hint: shipmentError.hint
        });
        throw new Error(`Database error: ${shipmentError.message}`);
      }

      if (shipmentData) {
        console.log("[QR DEBUG] Shipment found!");
        console.log("[QR DEBUG] order_id:", shipmentData.order_id);
        console.log("[QR DEBUG] tracking_number:", shipmentData.tracking_number);
      } else {
        console.log("[QR DEBUG] No shipment found for tracking:", trackingValue);
      }

      if (!shipmentData) {
        console.log("[InventoryQRScanner] No shipment found for tracking:", trackingValue);
        
        // Fallback: Try orders.tracking_number directly
        console.log("[QR DEBUG] Fallback: Query orders.tracking_number");
        const { data: orderTrackingData, error: orderTrackingError } = await supabase
          .from("orders")
          .select(`
            "Order ID",
            order_number,
            tracking_number,
            coliaty_parcel_code,
            customer_name,
            phone,
            city,
            status,
            shipping_status,
            created_at,
            returned_to_stock,
            sku,
            quantity,
            product_variant
          `)
          .eq("workspace_id", workspace.id)
          .eq("tracking_number", trackingValue)
          .limit(1);

        console.log("[InventoryQRScanner] Order tracking query result:", { data: orderTrackingData, error: orderTrackingError });

        if (orderTrackingError) {
          console.error("[InventoryQRScanner] ORDER TRACKING ERROR:", {
            message: orderTrackingError.message,
            code: orderTrackingError.code,
            details: orderTrackingError.details,
            hint: orderTrackingError.hint
          });
          throw new Error(`Database error: ${orderTrackingError.message}`);
        }

        if (orderTrackingData && orderTrackingData.length > 0) {
          console.log("[InventoryQRScanner] ✓ Found order via orders.tracking_number:", orderTrackingData[0].order_number);
          setOrderResult(orderTrackingData[0] as OrderResult);
          setLoading(false);
          return;
        }

        // Fallback: Try orders.coliaty_parcel_code
        console.log("[QR DEBUG] Fallback: Query orders.coliaty_parcel_code");
        const { data: coliatyData, error: coliatyError } = await supabase
          .from("orders")
          .select(`
            "Order ID",
            order_number,
            tracking_number,
            coliaty_parcel_code,
            customer_name,
            phone,
            city,
            status,
            shipping_status,
            created_at,
            returned_to_stock,
            sku,
            quantity,
            product_variant
          `)
          .eq("workspace_id", workspace.id)
          .eq("coliaty_parcel_code", trackingValue)
          .limit(1);

        console.log("[InventoryQRScanner] Coliaty query result:", { data: coliatyData, error: coliatyError });

        if (coliatyError) {
          console.error("[InventoryQRScanner] COLIATY ERROR:", {
            message: coliatyError.message,
            code: coliatyError.code,
            details: coliatyError.details,
            hint: coliatyError.hint
          });
          throw new Error(`Database error: ${coliatyError.message}`);
        }

        if (coliatyData && coliatyData.length > 0) {
          console.log("[InventoryQRScanner] ✓ Found order via coliaty_parcel_code:", coliatyData[0].order_number);
          setOrderResult(coliatyData[0] as OrderResult);
          setLoading(false);
          return;
        }

        // No order found
        console.log("[InventoryQRScanner] ✗ No order found for tracking:", trackingValue);
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Step 2: Get order from shipment
      const shipment = shipmentData;
      const orderId = shipment.order_id;
      console.log("[QR DEBUG] Step 2: Found shipment, order_id:", orderId);

      // Step 3: Fetch order by ID with workspace verification
      console.log("[QR DEBUG] QUERY STEP 3: orders lookup");
      console.log("[QR DEBUG] Table: orders");
      console.log("[QR DEBUG] Using \"Order ID\" column instead of id");
      console.log("[QR DEBUG] Columns: \"Order ID\", order_number, tracking_number, coliaty_parcel_code, customer_name, phone, city, status, shipping_status, created_at, workspace_id, returned_to_stock, sku, quantity, product_variant");
      console.log("[QR DEBUG] Filter: \"Order ID\" =", orderId, "workspace_id =", workspace.id);
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          "Order ID",
          order_number,
          tracking_number,
          coliaty_parcel_code,
          customer_name,
          phone,
          city,
          status,
          shipping_status,
          created_at,
          workspace_id,
          returned_to_stock,
          sku,
          quantity,
          product_variant
        `)
        .eq('"Order ID"', orderId)
        .eq("workspace_id", workspace.id)
        .maybeSingle();

      console.log("[QR DEBUG] Order query result:", { data: orderData, error: orderError });

      if (orderError) {
        console.error("[QR DEBUG ERROR] ORDER QUERY FAILED:", {
          message: orderError.message,
          code: orderError.code,
          details: orderError.details,
          hint: orderError.hint
        });
        throw new Error(`Database error: ${orderError.message}`);
      }

      if (!orderData) {
        console.log("[InventoryQRScanner] Order not found or not in current workspace");
        setNotFound(true);
        setLoading(false);
        return;
      }

      console.log("[InventoryQRScanner] ✓ Found order:", orderData.order_number, "workspace_id:", orderData.workspace_id);
      setOrderResult(orderData as OrderResult);

      // Auto-return to stock if enabled and eligible
      if (autoReturnToStock && !orderData.returned_to_stock) {
        // Check if already returned using helper
        if (isAlreadyReturnedToStock(orderData as OrderResult)) {
          console.log("[InventoryQRScanner] Package already returned, skipping auto-return");
          setReturnToStockResult({
            success: false,
            error: "Already Returned to Stock",
            tracking: orderData.tracking_number || orderData.coliaty_parcel_code || orderData.order_number,
            productName: "Product",
            qty: 0,
            alreadyReturned: true,
          });
          setReturnedToStockSuccess(false);
        } else if (isEligibleForReturnToStock(orderData as OrderResult)) {
          console.log("[InventoryQRScanner] Auto-returning to stock for eligible order");
          await handleReturnToStock(orderData as OrderResult);
        }
      }
    } catch (err) {
      console.error("[InventoryQRScanner] Lookup exception:", err);
      const errorMessage = err instanceof Error ? err.message : "Unable to search package. Please try again.";
      setDbError(errorMessage);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, autoReturnToStock, isAlreadyReturnedToStock, isEligibleForReturnToStock, handleReturnToStock]);

  // Start camera
  const startCamera = useCallback(async () => {
    console.log("[InventoryQRScanner] Starting camera");
    
    // Stop any existing camera first
    if (streamRef.current) {
      console.log("[InventoryQRScanner] Stopping existing camera stream");
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    try {
      setCameraError(null);
      setCameraActive(false);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        setScanning(true);
        console.log("[InventoryQRScanner] Camera started successfully");
      }
    } catch (err) {
      console.error("[InventoryQRScanner] Camera error:", err);
      setCameraError(err instanceof Error ? err.message : "Failed to access camera");
      setScanning(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    console.log("[InventoryQRScanner] Stopping camera");
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setCameraActive(false);
    setScanning(false);
  }, []);

  // Start a completely fresh scan
  const startFreshScan = useCallback(async () => {
    console.log("[InventoryQRScanner] Starting fresh scan");
    
    // 1. Stop existing camera
    stopCamera();
    
    // 2. Reset ALL state immediately
    resetScannerState();
    
    // 3. Force camera UI to render
    setCameraVisible(true);
    
    // 4. Wait for next render cycle to ensure UI is updated (reduced delay for faster bulk scanning)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 5. Start new camera
    await startCamera();
  }, [stopCamera, resetScannerState, startCamera]);

  // Auto-reset after successful return
  useEffect(() => {
    if (returnedToStockSuccess && returnToStockResult) {
      // Faster reset for auto mode, slower for manual mode to show feedback
      const delay = autoReturnToStock ? 500 : 1500;
      const timer = setTimeout(() => {
        console.log("[InventoryQRScanner] Auto-resetting for next scan", { autoReturnToStock, delay });
        startFreshScan();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [returnedToStockSuccess, returnToStockResult, startFreshScan, autoReturnToStock]);

  // Auto-reset after duplicate or not eligible
  useEffect(() => {
    if (returnToStockResult?.alreadyReturned || returnToStockResult?.notEligible) {
      const delay = autoReturnToStock ? 500 : 2000;
      const timer = setTimeout(() => {
        console.log("[InventoryQRScanner] Auto-resetting after duplicate/not eligible", { autoReturnToStock, delay });
        startFreshScan();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [returnToStockResult, startFreshScan, autoReturnToStock]);

  // Auto-reset after not found (in auto mode only)
  useEffect(() => {
    if (notFound && autoReturnToStock) {
      const timer = setTimeout(() => {
        console.log("[InventoryQRScanner] Auto-resetting after not found (auto mode)");
        startFreshScan();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [notFound, autoReturnToStock, startFreshScan]);

  // Scan for QR codes
  const scanQRCode = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraActive || !scanning) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Try to detect QR code
    try {
      const jsQR = await loadJsQR();
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        // Prevent duplicate scans
        if (isProcessingRef.current) {
          console.log("[InventoryQRScanner] Already processing, ignoring duplicate QR");
          return;
        }

        isProcessingRef.current = true;

        const rawValue = code.data;
        // Normalize: trim whitespace and remove \r and \n
        const normalizedValue = rawValue.trim().replace(/[\r\n]/g, '');

        console.log("[InventoryQRScanner] QR detected:", normalizedValue);

        setDetectedValue(normalizedValue);
        setScanning(false);
        stopCamera();
        setCameraVisible(false);
        onQRDetected(normalizedValue);
        // Perform order lookup with normalized value
        await lookupOrder(normalizedValue);
        
        // DO NOT reset processing flag here - it will be reset when startFreshScan is called
        // This prevents duplicate QR detection during the success/already-returned state
        return;
      }
    } catch (err) {
      console.error("[InventoryQRScanner] QR detection error:", err);
    }

    // Continue scanning
    if (scanning) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    }
  }, [cameraActive, scanning, loadJsQR, stopCamera, onQRDetected, lookupOrder]);

  // Initialize scanner when modal opens
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      console.log("[InventoryQRScanner] Modal opened, starting fresh scan");
      startFreshScan();
      return () => {
        document.body.style.overflow = previousOverflow;
        stopCamera();
        resetScannerState();
      };
    } else {
      console.log("[InventoryQRScanner] Modal closed, stopping camera and resetting state");
      stopCamera();
      resetScannerState();
    }

    return () => {
      stopCamera();
      resetScannerState();
    };
  }, [isOpen, startFreshScan, stopCamera, resetScannerState]);

  // Start scanning loop when camera is active
  useEffect(() => {
    if (cameraActive && scanning) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraActive, scanning, scanQRCode]);

  if (!isOpen) return null;

  return (
    <div className="qr-scanner-overlay fixed inset-0 flex h-dvh w-screen items-stretch justify-center bg-black" role="dialog" aria-modal="true" aria-label="Inventory QR scanner">
      <div className="flex h-dvh w-full max-w-3xl flex-col overflow-hidden bg-base-surface md:my-6 md:h-[calc(100dvh-3rem)] md:rounded-2xl md:border md:border-base-border md:shadow-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-base-border px-[max(1rem,env(safe-area-inset-left))] pb-3 pt-[calc(.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-brand" />
            <span className="text-[14px] font-semibold text-ink">QR Scanner</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto Return Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-faint">Auto Return</span>
              <button
                type="button"
                onClick={() => setAutoReturnToStock(!autoReturnToStock)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  autoReturnToStock ? 'bg-brand' : 'bg-base-border'
                }`}
                aria-label="Toggle automatic return to stock"
                aria-pressed={autoReturnToStock}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    autoReturnToStock ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close scanner"
              className="rounded-full bg-base-raised/50 p-2 text-ink-faint hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scanner Content */}
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {/* Camera View - only visible when cameraVisible is true */}
          {cameraVisible && (
            <div className="relative min-h-[48dvh] overflow-hidden rounded-2xl bg-black md:min-h-0 md:aspect-[4/3]">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning Frame */}
            {cameraActive && scanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-48 h-48">
                  {/* Corner markers */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand" />
                  
                  {/* Scanning line animation */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand" style={{
                    animation: 'scan 2s ease-in-out infinite'
                  }} />
                </div>
              </div>
            )}

            {/* Loading State */}
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={24} className="text-brand animate-spin" />
                  <span className="text-[12px] text-white">Starting camera...</span>
                </div>
              </div>
            )}

            {/* Error State - Camera Only */}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <AlertCircle size={24} className="text-red-500" />
                  <span className="text-[12px] text-white">{cameraError}</span>
                </div>
              </div>
            )}

            {/* Scanning indicator */}
            {cameraActive && scanning && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5">
                <ScanLine size={12} className="text-brand animate-pulse" />
                <span className="text-[11px] text-white font-medium">Scanning...</span>
              </div>
            )}
          </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="rounded-xl bg-brand/5 border border-brand/20 p-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 size={20} className="text-brand animate-spin" />
                <span className="text-[13px] font-medium text-brand">Looking up package...</span>
              </div>
            </div>
          )}

          {/* Order Found Success */}
          {orderResult && !loading && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-600" />
                <span className="text-[13px] font-semibold text-emerald-900">Package Found</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Package size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">Tracking Number</div>
                    <div className="text-[13px] font-mono text-emerald-900 break-all">
                      {orderResult.tracking_number || orderResult.coliaty_parcel_code || detectedValue}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <Box size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">Order Number</div>
                    <div className="text-[13px] font-mono text-emerald-900 break-all">
                      {orderResult.order_number}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <User size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">Customer</div>
                    <div className="text-[13px] text-emerald-900 break-all">
                      {orderResult.customer_name}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Phone size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">Phone</div>
                    <div className="text-[13px] text-emerald-900 break-all">
                      {orderResult.phone}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">City</div>
                    <div className="text-[13px] text-emerald-900 break-all">
                      {orderResult.city}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Truck size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-emerald-700 font-medium">Shipping Status</div>
                    <div className="text-[13px] text-emerald-900 break-all">
                      {orderResult.shipping_status
                        ? <ShippingStatusBadge status={orderResult.shipping_status} size="sm" />
                        : <StatusBadge status={orderResult.status || "new"} size="sm" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* View Order Button */}
              {onViewOrder && (
                <button
                  type="button"
                  onClick={() => onViewOrder(orderResult["Order ID"])}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition"
                >
                  <Box size={16} />
                  View Order
                </button>
              )}

              {/* Return To Stock Section */}
              <div className="pt-3 border-t border-emerald-200">
                {returnedToStockSuccess ? (
                  <div className="rounded-xl bg-emerald-100 border border-emerald-300 p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      <span className="text-[12px] font-semibold text-emerald-900">Return Completed ✓</span>
                    </div>
                    {returnToStockResult && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] text-emerald-800">
                          Product: {returnToStockResult.productName}
                        </div>
                        <div className="text-[11px] text-emerald-800">
                          Quantity Returned: {returnToStockResult.qty}
                        </div>
                      </div>
                    )}
                  </div>
                ) : returnToStockResult?.alreadyReturned ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} className="text-amber-600" />
                      <span className="text-[12px] font-semibold text-amber-900">Already Returned to Stock</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-amber-800">
                      <div>
                        <span className="font-medium">Tracking:</span> {orderResult?.tracking_number || orderResult?.coliaty_parcel_code || orderResult?.order_number}
                      </div>
                      <div>
                        <span className="font-medium">Order:</span> {orderResult?.order_number}
                      </div>
                      <div>
                        <span className="font-medium">Shipping Status:</span>{" "}
                        {orderResult?.shipping_status
                          ? <ShippingStatusBadge status={orderResult.shipping_status} size="sm" />
                          : <StatusBadge status={orderResult?.status || "new"} size="sm" />}
                      </div>
                      <div className="mt-2 italic">
                        This package was already returned to stock.
                      </div>
                    </div>
                  </div>
                ) : returnToStockResult?.notEligible ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-600" />
                      <span className="text-[12px] font-semibold text-amber-900">Not Eligible for Return</span>
                    </div>
                  </div>
                ) : returnToStockResult?.error ? (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-red-600" />
                      <span className="text-[12px] font-semibold text-red-900">{returnToStockResult.error}</span>
                    </div>
                  </div>
                ) : isAlreadyReturnedToStock(orderResult) ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} className="text-amber-600" />
                      <span className="text-[12px] font-semibold text-amber-900">Already Returned to Stock</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-amber-800">
                      <div>
                        <span className="font-medium">Shipping Status:</span>{" "}
                        {orderResult.shipping_status
                          ? <ShippingStatusBadge status={orderResult.shipping_status} size="sm" />
                          : <StatusBadge status={orderResult.status || "new"} size="sm" />}
                      </div>
                      <div className="mt-2 italic">
                        This package has already been processed.
                      </div>
                    </div>
                  </div>
                ) : !autoReturnToStock && isEligibleForReturnToStock(orderResult) && (
                  <button
                    type="button"
                    onClick={() => handleReturnToStock(orderResult)}
                    disabled={isReturningToStock}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isReturningToStock ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Returning to Stock...
                      </>
                    ) : (
                      <>
                        <RotateCcw size={16} />
                        Mark as Returned to Stock
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Not Found State */}
          {notFound && !loading && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-red-900 mb-1">
                    {dbError || "Tracking Number Not Found"}
                  </div>
                  {!dbError && (
                    <>
                      <div className="text-[11px] text-red-700 mb-2">
                        No order found with tracking number: <span className="font-mono">{detectedValue}</span>
                      </div>
                      <div className="text-[11px] text-red-600">
                        The tracking number may not exist in this workspace or may be associated with a different workspace.
                      </div>
                    </>
                  )}
                  {dbError && (
                    <div className="text-[11px] text-red-700">
                      {dbError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {cameraError && (
              <button
                type="button"
                onClick={startFreshScan}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 transition"
              >
                <Camera size={16} />
                Retry Camera
              </button>
            )}
            
            {(orderResult || notFound) && !loading && !isReturningToStock && (
              <button
                type="button"
                onClick={startFreshScan}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 transition"
              >
                <ScanLine size={16} />
                Scan Another
              </button>
            )}
            
            <button
              type="button"
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-base-raised/80 transition"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Scan animation styles */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
      `}</style>
    </div>
  );
}
