import type { ModuleInstance } from './main'
import type { CompanionPresetDefinitions } from '@companion-module/base'
import { STATUS_ICON_PNG64 } from './icons'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	presets['connection_status'] = {
		type: 'button',
		category: 'Status',
		name: 'Connection status',
		style: {
			// Transparent icon over the background colour, which the connection
			// feedback recolours (green = connected, dark red = disconnected).
			text: '',
			size: 'auto',
			color: 0xffffff,
			bgcolor: 0x660000,
			png64: STATUS_ICON_PNG64,
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
