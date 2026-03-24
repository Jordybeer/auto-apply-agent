'use client';

import { useState } from 'react';
import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const BELGIAN_CITIES = [
  'Antwerpen','Gent','Brussel','Luik','Brugge','Mechelen','Leuven','Hasselt','Namen',
  'Mons','Kortrijk','Aalst','Genk','Sint-Niklaas','Roeselare','Turnhout','Lier',
  'Herentals','Geel','Mol','Boom','Willebroek','Kontich','Mortsel','Deurne',
  'Hoboken','Merksem','Schoten','Wijnegem','Wommelgem','Stabroek','Kapellen',
  'Brasschaat','Edegem','Aartselaar','Hemiksem','Niel','Rumst','Duffel',
  'Sint-Katelijne-Waver','Bonheiden','Putte','Berlaar','Nijlen','Heist-op-den-Berg',
  'Lier','Aarschot','Diest','Tienen','Wavre','Ottignies','Waterloo','Ixelles',
  'Etterbeek','Schaerbeek','Molenbeek','Anderlecht','Jette','Laeken',
].sort();

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function CityCombobox({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors"
          style={{ background: '#2a2a32', border: '1px solid #3a3a45', color: value ? '#ffffff' : '#6b6b7b' }}
        >
          <span className="truncate">{value || 'Kies een stad...'}</span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" style={{ zIndex: 9999 }}>
        <Command>
          <CommandInput placeholder="Zoek stad..." />
          <CommandList>
            <CommandEmpty>Geen resultaten.</CommandEmpty>
            <CommandGroup>
              {BELGIAN_CITIES.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn('mr-2 h-4 w-4', value?.toLowerCase() === city.toLowerCase() ? 'opacity-100' : 'opacity-0')} />
                  {city}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
