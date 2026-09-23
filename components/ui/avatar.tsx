"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

/**
 * Avatar Radix (imagem + fallback com iniciais) + modo orb UImaxxing.
 *
 * Os showcases (`issue-activity-card`, `prediction-market-card`) usam
 * `<Avatar seed size />` sem filhos — a esfera periwinkle `.bg-orb` do
 * registry, com leve `hue-rotate` por `seed` para distinguir vizinhos.
 * Quando há filhos (uso do produto), o comportamento Radix é preservado.
 */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    seed?: number;
    size?: "sm" | "md" | "lg";
  }
>(({ className, seed = 0, size, children, ...props }, ref) => {
  if (children === undefined && size !== undefined) {
    const dims = size === "sm" ? "size-5" : size === "lg" ? "size-10" : "size-7";
    const hue = (seed % 3) * 14;
    return (
      <span
        className={cn("bg-orb inline-block shrink-0 rounded-full", dims, className)}
        style={hue ? { filter: `hue-rotate(-${hue}deg)` } : undefined}
        aria-hidden
      />
    );
  }
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {children}
    </AvatarPrimitive.Root>
  );
})
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      // Iniciais legíveis: text-text sobre bg-muted passa 4.5:1 nos dois
      // temas (claro #181925/#fafafa, dark #f4f4f4/#262626). O herdado
      // text-muted-foreground dava 4,44 no dark e quebrava o a11y do e2e.
      "flex h-full w-full items-center justify-center rounded-full bg-muted text-text",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
