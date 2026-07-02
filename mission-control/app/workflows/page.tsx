import fs from 'fs/promises';
import path from 'path';
import { PlanHubGuyPanel } from '@/app/components/PlanHubGuyPanel';
import type { CampaignReport } from '@/app/components/PlanHubGuyPanel';

export const dynamic = 'force-dynamic';

async function getCampaignReport(): Promise<CampaignReport | null> {
  try {
    const statsPath = path.join(process.cwd(), 'data', 'planhubguy', 'marketing-stats.json');
    return JSON.parse(await fs.readFile(statsPath, 'utf8')) as CampaignReport;
  } catch {
    return null;
  }
}

export default async function WorkflowsPage() {
  const campaignReport = await getCampaignReport();
  return <PlanHubGuyPanel campaignReport={campaignReport} />;
}
