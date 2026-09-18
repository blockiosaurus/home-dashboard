import { AccountsPanel } from '../components/AccountsPanel'
import { CalendarsPanel } from '../components/CalendarsPanel'
import { PeoplePanel } from '../components/PeoplePanel'
import { SceneOverridePanel } from '../components/SceneOverridePanel'
import { SleepSchedulePanel } from '../components/SleepSchedulePanel'

export const Settings = () => (
  <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-6 lg:grid-cols-2">
    <AccountsPanel />
    <CalendarsPanel />
    <PeoplePanel />
    <SceneOverridePanel />
    <SleepSchedulePanel />
  </div>
)
