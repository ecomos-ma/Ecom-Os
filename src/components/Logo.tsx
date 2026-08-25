import logoSrc from "../assets/logo.png";
import { useTheme } from "../hooks/useTheme";

interface LogoProps {
    collapsed?: boolean;
    className?: string;
}

export function Logo({ collapsed = false, className = "" }: LogoProps) {
    const { accent } = useTheme();
    const sizeClass = collapsed ? "h-8" : "h-10";

    return (
        <div className={`flex items-center gap-3 overflow-hidden ${className}`}>
            {!collapsed ? (
                <>
                    {/* Desktop: text-based horizontal logo with accent color */}
                    <span className="hidden md:flex font-bold tracking-[-0.04em] text-[22px] items-center leading-none whitespace-nowrap" style={{ color: accent }}>
                        ECOM <span className="text-[22px] font-semibold ml-1" style={{ color: accent }}>SCALE</span>
                    </span>

                    {/* Mobile / small screens: compact image logo */}
                    <img src={logoSrc} alt="App logo" className={`${sizeClass} w-auto object-contain md:hidden`} />
                </>
            ) : (
                <span className="font-bold text-[20px] leading-none" style={{ color: accent }}>E</span>
            )}
        </div>
    );
}
