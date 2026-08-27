import { HTMLMotionProps, motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type DataPulseProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

export function DataPulse({ children, className, ...props }: DataPulseProps) {
    const shouldReduceMotion = useReducedMotion();

    if (shouldReduceMotion) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            animate={{
                opacity: [1, 0.6, 1],
                scale: [1, 0.98, 1],
            }}
            transition={{
                duration: 2.5,
                ease: "easeInOut",
                repeat: Infinity,
            }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}
