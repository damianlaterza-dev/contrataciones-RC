"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MultiSelectProps<T> = {
  items: T[];
  value: T[];
  onChange: (items: T[]) => void;
  getLabel: (item: T) => string;
  getKey: (item: T) => string | number;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
};

export function MultiSelect<T>({
  items,
  value,
  onChange,
  getLabel,
  getKey,
  placeholder = "Seleccioná opciones",
  searchPlaceholder = "Buscar...",
  emptyText = "No se encontraron resultados.",
  disabled = false,
  "aria-invalid": ariaInvalid,
  className,
}: MultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);

  const selectedKeys = new Set(value.map((v) => String(getKey(v))));

  const toggle = (item: T) => {
    const key = String(getKey(item));
    if (selectedKeys.has(key)) {
      onChange(value.filter((v) => String(getKey(v)) !== key));
    } else {
      onChange([...value, item]);
    }
  };

  const displayText =
    value.length === 0
      ? null
      : value.length <= 2
        ? value.map(getLabel).join(", ")
        : `${value.length} áreas seleccionadas`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive dark:border-input dark:bg-input/30",
            !displayText && "text-muted-foreground",
            className,
          )}>
          <span className="line-clamp-1 text-start">
            {displayText ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 opacity-50 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                const key = String(getKey(item));
                const label = getLabel(item);
                const isSelected = selectedKeys.has(key);
                return (
                  <CommandItem
                    key={key}
                    value={label}
                    onSelect={() => toggle(item)}>
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
