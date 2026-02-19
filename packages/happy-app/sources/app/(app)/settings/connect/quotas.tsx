import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ItemList } from '@/components/ItemList';
import { QuotaCard } from '@/components/settings/quotas/QuotaCard';
import type { QuotaVendor } from '@slopus/happy-wire';

const VENDOR_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
};

export default React.memo(function QuotasScreen() {
    const params = useLocalSearchParams<{ vendor?: string }>();
    const vendor = (params.vendor ?? 'anthropic') as QuotaVendor;
    const title = VENDOR_LABELS[vendor] ?? vendor;

    const [pinnedMeterIds, setPinnedMeterIds] = React.useState<ReadonlyArray<string>>([]);

    return (
        <ItemList>
            <QuotaCard
                vendor={vendor}
                title={`${title} Quotas`}
                pinnedMeterIds={pinnedMeterIds}
                onSetPinnedMeterIds={setPinnedMeterIds}
            />
        </ItemList>
    );
});
