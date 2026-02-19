import * as React from 'react';

import { ItemList } from '@/components/ItemList';
import { QuotaCard } from '@/components/settings/quotas/QuotaCard';
import type { QuotaVendor } from '@slopus/happy-wire';

const VENDORS: ReadonlyArray<{ vendor: QuotaVendor; title: string }> = [
    { vendor: 'anthropic', title: 'Anthropic Quotas' },
    { vendor: 'openai', title: 'OpenAI Quotas' },
];

export default React.memo(function QuotasScreen() {
    const [pinnedMeterIds, setPinnedMeterIds] = React.useState<ReadonlyArray<string>>([]);

    return (
        <ItemList>
            {VENDORS.map(({ vendor, title }) => (
                <QuotaCard
                    key={vendor}
                    vendor={vendor}
                    title={title}
                    pinnedMeterIds={pinnedMeterIds}
                    onSetPinnedMeterIds={setPinnedMeterIds}
                />
            ))}
        </ItemList>
    );
});
