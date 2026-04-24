# shadcn/ui — Zaawansowane Wzorce

## Data Table z sorting, filtering, pagination

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

// Nagłówek z sortowaniem
const SortableHeader = ({ column, children }) => (
  <Button variant="ghost" onClick={() => column.toggleSorting()}>
    {children}
    <ArrowUpDown className="ml-2 h-4 w-4" />
  </Button>
);
```

## Command Palette (Search)

```tsx
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

// Otwieraj Ctrl+K
useEffect(() => {
  const down = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  };
  document.addEventListener('keydown', down);
  return () => document.removeEventListener('keydown', down);
}, []);
```

## Form z React Hook Form + Zod

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const schema = z.object({
  email: z.string().email('Nieprawidłowy email'),
  password: z.string().min(8, 'Min 8 znaków'),
});

const form = useForm({ resolver: zodResolver(schema) });
```

## Responsive Navigation Pattern

```tsx
// Desktop: horizontal nav bar
// Mobile: bottom tab bar lub hamburger sheet

const BottomNav = () => (
  <nav className="fixed bottom-0 inset-x-0 bg-card border-t md:hidden z-50">
    <div className="flex justify-around py-2">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-xs',
            isActive(item.href) ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </Link>
      ))}
    </div>
  </nav>
);
```

## Toast Notifications

```tsx
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// W komponencie:
const { toast } = useToast();

toast({
  title: 'Zapisano zmiany',
  description: 'Twoje zmiany zostały pomyślnie zapisane.',
});

toast({
  variant: 'destructive',
  title: 'Błąd',
  description: 'Nie udało się zapisać zmian. Spróbuj ponownie.',
});
```

## Skeleton Loading

```tsx
import { Skeleton } from '@/components/ui/skeleton';

// Card skeleton
const CardSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-4 w-[150px] mt-2" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-32 w-full" />
    </CardContent>
  </Card>
);

// Lista elementów
{
  isLoading
    ? Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))
    : items.map((item) => <ItemRow key={item.id} {...item} />);
}
```

## Dropzone (upload plików)

```tsx
// Użyj react-dropzone z shadcn Card
import { useDropzone } from "react-dropzone"

const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop: acceptedFiles => handleUpload(acceptedFiles),
  accept: { "image/*": [".png", ".jpg"] },
})

<div {...getRootProps()} className={cn(
  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
)}>
  <input {...getInputProps()} />
  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
  <p className="text-sm text-muted-foreground">
    {isDragActive ? "Upuść tutaj..." : "Przeciągnij pliki lub kliknij"}
  </p>
</div>
```

## Multi-step Form / Wizard

```tsx
const steps = ["Dane osobowe", "Adres", "Potwierdzenie"]

<div className="space-y-8">
  {/* Progress */}
  <div className="flex items-center gap-2">
    {steps.map((step, i) => (
      <Fragment key={step}>
        <div className={cn(
          "flex items-center gap-2 text-sm font-medium",
          i <= currentStep ? "text-primary" : "text-muted-foreground"
        )}>
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs",
            i < currentStep ? "bg-primary text-primary-foreground" :
            i === currentStep ? "border-2 border-primary text-primary" :
            "border border-muted-foreground"
          )}>
            {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          <span className="hidden sm:inline">{step}</span>
        </div>
        {i < steps.length - 1 && (
          <div className={cn("flex-1 h-px", i < currentStep ? "bg-primary" : "bg-border")} />
        )}
      </Fragment>
    ))}
  </div>

  {/* Step Content */}
  <div className="animate-in fade-in slide-in-from-right-4">
    {renderStep(currentStep)}
  </div>
</div>
```
