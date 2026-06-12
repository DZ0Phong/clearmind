import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional cap on auto-grow. Omit to grow freely (let the surrounding
   *  scroll container handle overflow). */
  maxRows?: number;
}

// Textarea that grows with content and shrinks back when lines are removed.
// CSS min-height (via className) still wins as the lower bound.
export const AutoTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoTextarea({ className, maxRows, value, ...rest }, fwdRef) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(fwdRef, () => innerRef.current as HTMLTextAreaElement);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const content = el.scrollHeight;
      if (maxRows == null) {
        el.style.height = content + "px";
        el.style.overflowY = "hidden";
        return;
      }
      const cs = getComputedStyle(el);
      const lineHeight = parseFloat(cs.lineHeight) || 20;
      const padY =
        parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const maxH = lineHeight * maxRows + padY;
      el.style.height = Math.min(content, maxH) + "px";
      el.style.overflowY = content > maxH ? "auto" : "hidden";
    }, [value, maxRows]);

    return (
      <textarea
        ref={innerRef}
        value={value}
        className={cn("resize-none", className)}
        {...rest}
      />
    );
  }
);
