import { AccountsPanel } from '../components/AccountsPanel'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { SystemPanel } from '../components/SystemPanel'

export const Settings = () => (
  <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-6 lg:grid-cols-2">
    <AccountsPanel />
    <SystemPanel />
    <ScheduleEditor />
  </div>
)
