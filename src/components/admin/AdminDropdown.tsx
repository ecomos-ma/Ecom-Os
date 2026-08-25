import { useState, useRef, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

interface AdminDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function AdminDropdown({ trigger, children, align = 'right', className = '' }: AdminDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current && dropdownRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let top = triggerRect.bottom + 8;
      let left = align === 'right' 
        ? triggerRect.right - dropdownRect.width 
        : triggerRect.left;

      // Check if dropdown would go below viewport
      if (top + dropdownRect.height > viewportHeight - 20) {
        top = triggerRect.top - dropdownRect.height - 8;
      }

      // Check if dropdown would go outside right edge
      if (left + dropdownRect.width > viewportWidth - 20) {
        left = viewportWidth - dropdownRect.width - 20;
      }

      // Check if dropdown would go outside left edge
      if (left < 20) {
        left = 20;
      }

      setPosition({ top, left });
    }
  }, [isOpen, align]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      
      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className={`fixed z-50 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden ${className}`}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            {children}
          </div>,
          document.body
        )
      }
    </>
  );
}