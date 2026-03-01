import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border border-slate-700 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default: "border-transparent bg-slate-800 text-slate-100",
                secondary: "border-transparent bg-slate-800 text-slate-100 hover:bg-slate-700",
                destructive: "border-transparent bg-red-500/10 text-red-500 hover:bg-red-500/20",
                outline: "text-slate-100",
                neon: "border-brand-neon/50 bg-brand-neon/10 text-brand-neon shadow-[0_0_10px_rgba(217,70,239,0.2)]",
                purple: "border-brand-purple/50 bg-brand-purple/10 text-brand-purple",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
