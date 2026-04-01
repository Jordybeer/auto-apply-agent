'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SettingsMenu from '@/components/SettingsMenu';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Instellingen</SheetTitle>
        </SheetHeader>
        <div className="p-6 pt-4">
          {open && <SettingsMenu />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
