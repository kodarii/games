# Tailwind — Przydatne Klasy i Triki

## Responsywne ukrywanie/pokazywanie

```html
<!-- Tylko mobile -->
<div class="block md:hidden">...</div>

<!-- Tylko tablet+ -->
<div class="hidden md:block lg:hidden">...</div>

<!-- Tylko desktop -->
<div class="hidden lg:block">...</div>
```

## Container z max-width

```html
<div class="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8"></div>
```

## Full-height layout bez scroll na body

```html
<body class="h-screen overflow-hidden">
  <div class="flex h-full">
    <aside class="w-64 h-full overflow-y-auto">...</aside>
    <main class="flex-1 h-full overflow-y-auto">...</main>
  </div>
</body>
```

## Truncate długi tekst

```html
<!-- Single line -->
<p class="truncate">Długi tekst...</p>

<!-- Multi-line (2 linie) -->
<p class="line-clamp-2">Długi tekst...</p>
<p class="line-clamp-3">Długi tekst...</p>
```

## Aspect ratio

```html
<div class="aspect-video"><!-- 16:9 --></div>
<div class="aspect-square"><!-- 1:1 --></div>
<div class="aspect-[4/3]"><!-- 4:3 --></div>
```

## Grid auto-fill (responsywny bez breakpointów)

```html
<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"></div>
```

## Sticky header z efektem blur

```html
<header
  class="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b"
></header>
```

## Gradient text

```html
<h1
  class="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent"
></h1>
```

## Scrollbar ukryty (ale scrollowalny)

```html
<div class="overflow-x-auto scrollbar-hide">
  <!-- tailwind-scrollbar-hide plugin lub: -->
  <style>
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
  </style>
</div>
```

## Ring focus state

```html
<button
  class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
></button>
```

## Hover card lift

```html
<div
  class="transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer"
></div>
```

## Przycisk z loading state

```html
<button
  disabled="{isLoading}"
  class="disabled:opacity-50 disabled:cursor-not-allowed"
>
  {isLoading ? <Loader2 className="animate-spin" /> : "Zapisz"}
</button>
```

## Divider z tekstem

```html
<div class="relative flex items-center py-4">
  <div class="flex-1 border-t border-border" />
  <span class="mx-4 text-sm text-muted-foreground">lub</span>
  <div class="flex-1 border-t border-border" />
</div>
```

## Badge/Tag dynamiczny kolor

```tsx
const statusColors = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

<span class={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[status])}>
  {status}
</span>
```

## cn() utility (obowiązkowe)

```tsx
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Animacje wejścia (tailwindcss-animate)

```html
<!-- Dostępne klasy: -->
animate-in fade-in animate-in slide-in-from-top-4 animate-in
slide-in-from-bottom-4 animate-in slide-in-from-left-4 animate-in
slide-in-from-right-4 animate-in zoom-in-95

<!-- Z opóźnieniem: -->
style={{ animationDelay: "150ms" }}

<!-- Wyjście: -->
animate-out fade-out zoom-out-95
```

## Safe Area dla mobile (notch/Dynamic Island)

```html
<div class="pb-safe pt-safe">
  <!-- tailwindcss-safe-area plugin lub: -->
  <style>
    .pb-safe {
      padding-bottom: env(safe-area-inset-bottom);
    }
    .pt-safe {
      padding-top: env(safe-area-inset-top);
    }
  </style>
</div>
```
