import type { ModuleInstance } from './main'
import type { CompanionPresetDefinitions } from '@companion-module/base'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	presets['connection_status'] = {
		type: 'button',
		category: 'Status',
		name: 'Connection status',
		style: {
			text: 'Pixotope',
			size: 'auto',
			color: 0xffffff,
			bgcolor: 0x660000,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'connection_status',
				options: {},
				style: {
					bgcolor: 0x006600,
					color: 0xffffff,
				},
			},
		],
	}

	self.setPresetDefinitions(presets)
}
