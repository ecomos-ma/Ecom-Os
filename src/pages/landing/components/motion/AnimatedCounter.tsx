import { motion, useInView, useAnimation, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
    target: number;
    duration?: number;
    suffix?: string;
    prefix?: string;
    formatter?: (val: number) => string;
}

export function AnimatedCounter({ target, duration = 1.5, suffix = "", prefix = "", formatter }: AnimatedCounterProps) {
    const shouldReduceMotion = useReducedMotion();
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: "-50px" });
    const [current, setCurrent] = useState(shouldReduceMotion ? target : 0);

    useEffect(() => {
        if (shouldReduceMotion) return;
        if (!inView) return;

        let startTime: number | null = null;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = (timestamp - startTime) / (duration * 1000);

            if (progress < 1) {
                // easeOutExpo
                const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                setCurrent(target * easeProgress);
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCurrent(target);
            }
        };

        animationFrame = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationFrame);
    }, [inView, target, duration, shouldReduceMotion]);

    const displayValue = formatter
        ? formatter(current)
        : Math.round(current).toLocaleString();

    return (
        <span ref={ref} className="font-mono tabular-nums">
            {prefix}{displayValue}{suffix}
        </span>
    );
}
