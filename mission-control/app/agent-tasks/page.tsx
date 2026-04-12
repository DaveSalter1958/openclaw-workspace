import { getTaskBoard } from '@/lib/data';
import { AgentTaskConsole } from '@/app/components/AgentTaskConsole';

export const dynamic = 'force-dynamic';

export default async function AgentTasksPage() {
  const { agentTasks } = await getTaskBoard();
  return <AgentTaskConsole initialTasks={agentTasks} />;
}
