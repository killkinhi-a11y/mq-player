---
name: ui
description: "Skill for the Ui area of mq-player. 189 symbols across 45 files."
---

# Ui

189 symbols | 45 files | Cohesion: 92%

## When to Use

- Working with code in `src/`
- Understanding how cn, useIsMobile work
- Modifying ui-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/ui/sidebar.tsx` | SidebarProvider, SidebarInset, SidebarInput, SidebarHeader, SidebarFooter (+19) |
| `src/components/ui/menubar.tsx` | Menubar, MenubarTrigger, MenubarContent, MenubarItem, MenubarCheckboxItem (+6) |
| `src/components/ui/dropdown-menu.tsx` | DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel (+4) |
| `src/components/ui/context-menu.tsx` | ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem (+4) |
| `src/components/ui/table.tsx` | Table, TableHeader, TableBody, TableFooter, TableRow (+3) |
| `src/components/ui/navigation-menu.tsx` | NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent (+3) |
| `src/components/ui/command.tsx` | Command, CommandDialog, CommandInput, CommandList, CommandGroup (+3) |
| `src/components/ui/alert-dialog.tsx` | AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle (+3) |
| `src/components/ui/select.tsx` | SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator (+2) |
| `src/components/ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardAction (+2) |

## Entry Points

Start here when exploring this area:

- **`cn`** (Function) — `src/lib/utils.ts:3`
- **`useIsMobile`** (Function) — `src/hooks/use-mobile.ts:4`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `cn` | Function | `src/lib/utils.ts` | 3 |
| `useIsMobile` | Function | `src/hooks/use-mobile.ts` | 4 |
| `TooltipContent` | Function | `src/components/ui/tooltip.tsx` | 36 |
| `Toggle` | Function | `src/components/ui/toggle.tsx` | 30 |
| `ToggleGroup` | Function | `src/components/ui/toggle-group.tsx` | 16 |
| `ToggleGroupItem` | Function | `src/components/ui/toggle-group.tsx` | 42 |
| `Textarea` | Function | `src/components/ui/textarea.tsx` | 4 |
| `Tabs` | Function | `src/components/ui/tabs.tsx` | 7 |
| `TabsList` | Function | `src/components/ui/tabs.tsx` | 20 |
| `TabsTrigger` | Function | `src/components/ui/tabs.tsx` | 36 |
| `TabsContent` | Function | `src/components/ui/tabs.tsx` | 52 |
| `Table` | Function | `src/components/ui/table.tsx` | 6 |
| `TableHeader` | Function | `src/components/ui/table.tsx` | 21 |
| `TableBody` | Function | `src/components/ui/table.tsx` | 31 |
| `TableFooter` | Function | `src/components/ui/table.tsx` | 41 |
| `TableRow` | Function | `src/components/ui/table.tsx` | 54 |
| `TableHead` | Function | `src/components/ui/table.tsx` | 67 |
| `TableCell` | Function | `src/components/ui/table.tsx` | 80 |
| `TableCaption` | Function | `src/components/ui/table.tsx` | 93 |
| `Switch` | Function | `src/components/ui/switch.tsx` | 7 |

## How to Explore

1. `gitnexus_context({name: "cn"})` — see callers and callees
2. `gitnexus_query({query: "ui"})` — find related execution flows
3. Read key files listed above for implementation details
