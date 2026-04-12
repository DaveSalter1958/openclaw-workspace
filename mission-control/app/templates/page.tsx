import { readFile } from 'fs/promises';
import { PlanHubGuyTemplatesEditor } from '@/app/components/PlanHubGuyTemplatesEditor';

const filePath = '/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy-templates.json';

export default async function TemplatesPage() {
  const raw = await readFile(filePath, 'utf8');
  const templates = JSON.parse(raw);
  return <PlanHubGuyTemplatesEditor initialTemplates={templates} />;
}
