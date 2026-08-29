export type PaymentReceiptData = {
  id: string;
  receiptNumber: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  billingCycle: string;
  amountMad: number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  submittedAt: string;
  status: string;
};

export function receiptStatusCopy(status: string) {
  const normalized = status.toLowerCase();
  if (["paid", "approved", "active"].includes(normalized)) return { label: "Payment approved", detail: "Verified by the EcomOS billing team." };
  if (normalized === "waived") return { label: "Approved", detail: "Approved by the EcomOS billing team." };
  if (["rejected", "cancelled"].includes(normalized)) return { label: "Needs attention", detail: "Review the billing note and submit a valid proof." };
  return { label: "Proof received", detail: "Awaiting secure verification by the EcomOS billing team." };
}

export function receiptVerificationPayload(receipt: PaymentReceiptData) {
  return [
    "ECOMOS_PAYMENT_RECEIPT",
    "V1",
    receipt.receiptNumber,
    receipt.id,
    receipt.submittedAt,
    `${receipt.amountMad.toFixed(2)}_${receipt.currency}`,
  ].join("|");
}

export async function downloadPaymentReceiptPdf(receipt: PaymentReceiptData) {
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const qrDataUrl = await QRCode.default.toDataURL(receiptVerificationPayload(receipt), {
    width: 320,
    margin: 1,
    color: { dark: "#321421", light: "#ffffff" },
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const x = 24;
  const y = 14;
  const w = pageWidth - 48;
  const h = pageHeight - 28;
  const pink = "#e73773";
  const berry = "#321421";
  const muted = "#80576a";
  const blush = "#fff2f7";
  const border = "#f2c5d6";
  const safe = (value: string | null | undefined, fallback = "Not provided") => (value?.trim() || fallback).replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  const status = receiptStatusCopy(receipt.status);
  const date = new Intl.DateTimeFormat("en-MA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(new Date(receipt.submittedAt));

  doc.setFillColor("#f7f2f5");
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor("#ffffff");
  doc.setDrawColor(border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");

  doc.setFillColor(pink);
  doc.roundedRect(x, y, w, 48, 4, 4, "F");
  doc.rect(x, y + 39, w, 9, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("EcomOS", x + 12, y + 17);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PAYMENT PROOF RECEIPT", x + 12, y + 25);
  doc.setFontSize(10);
  doc.text("Secure Moroccan COD workspace billing", x + 12, y + 34);
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text(safe(receipt.receiptNumber), x + w - 12, y + 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("SYSTEM TICKET", x + w - 12, y + 24, { align: "right" });

  let cursor = y + 62;
  doc.setTextColor(berry);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Your payment proof is recorded", x + 12, cursor);
  cursor += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(muted);
  doc.text("Keep this receipt while the EcomOS billing team verifies your bank transfer.", x + 12, cursor);

  cursor += 11;
  doc.setFillColor(blush);
  doc.setDrawColor(border);
  doc.roundedRect(x + 12, cursor, w - 24, 19, 3, 3, "FD");
  doc.setTextColor(pink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(status.label, x + 18, cursor + 8);
  doc.setTextColor(muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(status.detail, x + 18, cursor + 13.5);

  cursor += 31;
  const rows: Array<[string, string, string, string]> = [
    ["CUSTOMER", safe(receipt.customerName), "EMAIL", safe(receipt.customerEmail)],
    ["PLAN", `${safe(receipt.planName)} - ${safe(receipt.billingCycle)}`, "AMOUNT", `${receipt.amountMad.toLocaleString("en-US")} ${safe(receipt.currency)}`],
    ["PAYMENT METHOD", safe(receipt.paymentMethod), "TRANSFER REFERENCE", safe(receipt.transactionReference)],
    ["SUBMITTED", safe(date), "STATUS", safe(status.label)],
  ];
  rows.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    doc.setDrawColor("#f3dbe4");
    doc.line(x + 12, cursor + 16, x + w - 12, cursor + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor("#ad7188");
    doc.text(leftLabel, x + 12, cursor);
    doc.text(rightLabel, x + 86, cursor);
    doc.setFontSize(9);
    doc.setTextColor(berry);
    doc.text(safe(leftValue), x + 12, cursor + 7, { maxWidth: 66 });
    doc.text(safe(rightValue), x + 86, cursor + 7, { maxWidth: w - 98 });
    cursor += 22;
  });

  cursor += 3;
  doc.addImage(qrDataUrl, "PNG", x + 12, cursor, 36, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(berry);
  doc.text("Receipt verification", x + 55, cursor + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(muted);
  const verificationCopy = doc.splitTextToSize("Scan this QR to read the system ticket payload. The payment request and uploaded proof remain archived securely in EcomOS.", w - 70);
  doc.text(verificationCopy, x + 55, cursor + 14);
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(safe(receipt.id), x + 55, cursor + 29);

  doc.setFillColor("#fff8fb");
  doc.setDrawColor(border);
  doc.roundedRect(x + 12, y + h - 36, w - 24, 19, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(pink);
  doc.text("IMPORTANT", x + 18, y + h - 28);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(muted);
  doc.text("This receipt confirms proof submission. It is not a final bank-payment approval until EcomOS verifies it.", x + 18, y + h - 22, { maxWidth: w - 36 });
  doc.setFontSize(6.5);
  doc.setTextColor("#aa8191");
  doc.text("EcomOS Billing - Morocco - Support: 0770877821", pageWidth / 2, y + h - 7, { align: "center" });

  doc.save(`EcomOS-receipt-${receipt.receiptNumber}.pdf`);
}
