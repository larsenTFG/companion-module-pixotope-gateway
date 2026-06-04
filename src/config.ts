import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	version: string
	pollInterval: number
	feedbackPollInterval: number
	defaultEngine: string
}

export const DEFAULT_ENGINE_TARGET = '~LOCAL~-Engine'

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'About',
			width: 12,
			value:
				'This module talks to the Pixotope Gateway HTTP API. Make sure Pixotope Gateway is running and reachable. Use the "API Log" tab in Pixotope Director to capture the exact Topic/Message JSON for any action you want to replicate.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Gateway IP',
			width: 6,
			default: '127.0.0.1',
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Gateway Port',
			width: 3,
			min: 1,
			max: 65535,
			default: 16208,
		},
		{
			type: 'textinput',
			id: 'version',
			label: 'Gateway API Version',
			width: 3,
			default: '2.2.0',
			tooltip: 'Matches the /gateway/{version}/publish endpoint of your Pixotope installation.',
		},
		{
			type: 'textinput',
			id: 'defaultEngine',
			label: 'Default Engine Target',
			width: 6,
			default: DEFAULT_ENGINE_TARGET,
			tooltip: 'Service name used for Engine API calls when an action leaves the target blank.',
		},
		{
			type: 'number',
			id: 'feedbackPollInterval',
			label: 'Live Value Poll Interval (ms)',
			width: 6,
			min: 250,
			max: 60000,
			default: 1000,
			tooltip:
				'How often live "watch" feedbacks refresh their values. Lower = fresher (less stale) but more network traffic. Only properties/values with a watch feedback attached are polled.',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Connection Check Interval (ms)',
			width: 6,
			min: 0,
			max: 60000,
			default: 5000,
			tooltip:
				'Heartbeat used only when no live values are being watched (watched values already prove the connection). Higher = gentler on the Gateway. Set to 0 to disable.',
		},
	]
}
