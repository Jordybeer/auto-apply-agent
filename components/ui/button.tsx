import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors active:scale-95 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: '[background:var(--surface2)] text-[var(--text)] hover:[background:var(--surface3)]',
        ghost: 'text-[var(--text3)] hover:text-[var(--text)] hover:[background:var(--btn-ghost)]',
        destructive: '[background:var(--red-dim)] text-[var(--red)] hover:[background:var(--red-glow)]',
        pill: '[background:var(--surface2)] text-[var(--text)] hover:[background:var(--surface3)] rounded-full',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-10 px-4 text-xs',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
