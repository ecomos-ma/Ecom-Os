import { HTMLMotionProps, motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";

interface RevealProps extends HTMLMotionProps<"div"> {
    delay?: number;
    direction?: "up" | "down" | "left" | "right";
    duration?: number;
}

export function Reveal({ delay = 0, direction = "up", duration = 0.5, children, ...props }: RevealProps) {
    const shouldReduceMotion = useReducedMotion();

    const directionOffsets = {
        up: { y: 30 },
        down: { y: -30 },
        left: { x: 30 },
        right: { x: -30 },
    };

    const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...directionOffsets[direction] };
    const animate = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };

    return (
        <motion.div
            initial={initial}
            whileInView={animate}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
            {...props}
        >
            {children}
        </motion.div>
    );
}
