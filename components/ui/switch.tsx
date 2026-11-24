"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // O alvo de toque é 44×44; a pista continua com 20×36. Antes o ROOT
      // era a pista (36×20) e a varredura mobile reprovava todas as telas
      // com switch — o dedo errava o alvo mesmo parecendo correto.
      "peer inline-grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:[&>span]:bg-primary data-[state=unchecked]:[&>span]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <span className="pointer-events-none inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent shadow-sm transition-colors">
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )}
      />
    </span>
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
