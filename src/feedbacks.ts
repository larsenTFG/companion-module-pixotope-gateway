import type { CompanionInputFieldTextInput } from '@companion-module/base'
import type { ModuleInstance } from './main'
import { formatResult, parseGatewayUrl } from './api'

type OptionValue = string | number | boolean | Array<string | number> | undefined

function str(value: OptionValue): string {
	if (value === undefined || value === null) return ''
	if (Array.isArray(value)) return value.join(',')
	return String(value)
}

/** Turn a user-supplied label into a safe Companion variable id (alphanumerics + underscores). */
function toVariableId(label: string): string {
	const cleaned = label
		.trim()
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase()
	return `prop_${cleaned || 'value'}`
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const urlField: CompanionInputFieldTextInput = {
		id: 'url',
		type: 'textinput',
		label: 'Editor URL',
		default: '',
		useVariables: true,
		tooltip:
			'Right-click the property in the Pixotope editor, copy its URL, and paste it here (any GetProperty/SetProperty URL works).',
	}

	async function resolveLocation(options: Record<string, OptionValue>): Promise<{
		target: string
		objectSearch: string
		propertyPath: string
	}> {
		const url = (await self.parseVariablesInString(str(options.url))).trim()
		if (url === '') return { target: self.config.defaultEngine, objectSearch: '', propertyPath: '' }
		try {
			const parsed = parseGatewayUrl(url)
			const params = parsed.Message?.Params ?? {}
			return {
				target: parsed.Topic.Target || self.config.defaultEngine,
				objectSearch: formatResult(params.ObjectSearch),
				propertyPath: formatResult(params.PropertyPath),
			}
		} catch (e) {
			self.log('warn', `Property modified feedback: ${e instanceof Error ? e.message : String(e)}`)
			return { target: self.config.defaultEngine, objectSearch: '', propertyPath: '' }
		}
	}

	self.setFeedbackDefinitions({
		connection_status: {
			name: 'Gateway connection OK',
			description: 'True while the module can reach the Pixotope Gateway.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x00c800,
				color: 0x000000,
			},
			options: [],
			callback: () => self.connected,
		},

		property_modified: {
			name: 'Engine: Property differs from default',
			description:
				'Polls a property and turns the button on while its value differs from its default. Paste the property URL copied from the editor right-click menu.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xffa500,
				color: 0x000000,
			},
			options: [urlField],
			callback: (feedback) => self.isPropertyFeedbackModified(feedback.id),
			subscribe: async (feedback) => {
				self.registerPropertyFeedback(feedback.id, {
					kind: 'property',
					name: '',
					...(await resolveLocation(feedback.options)),
				})
			},
			unsubscribe: (feedback) => {
				self.unregisterPropertyFeedback(feedback.id)
			},
		},

		watch_property: {
			name: 'Engine: Watch property → variable (live)',
			description:
				'Polls a property and keeps a Companion variable updated with its value. Use the variable anywhere as $(pixotope:prop_<name>). Add this to any button (it applies no styling).',
			type: 'advanced',
			options: [
				urlField,
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Store in variable',
					default: '',
					tooltip: 'A short name. The value is exposed as $(pixotope:prop_<name>). Defaults to the property name.',
				},
			],
			// No styling — the value is delivered through the variable.
			callback: () => ({}),
			subscribe: async (feedback) => {
				const location = await resolveLocation(feedback.options)
				const label = str(feedback.options.variableName).trim() || location.propertyPath || 'value'
				self.registerPropertyFeedback(feedback.id, {
					kind: 'property',
					name: '',
					...location,
					variableId: toVariableId(label),
					variableLabel: `${location.objectSearch} ${location.propertyPath}`.trim() || label,
				})
			},
			unsubscribe: (feedback) => {
				self.unregisterPropertyFeedback(feedback.id)
			},
		},

		watch_store: {
			name: 'Store: Watch value → variable (live)',
			description:
				'Polls a value from the Pixotope Store (or another stateful service) and keeps a Companion variable updated with it. Use the variable anywhere as $(pixotope:prop_<name>). Applies no styling.',
			type: 'advanced',
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'State Path',
					default: '',
					useVariables: true,
					tooltip:
						'e.g. State.General.FrameRate. Tip: open …/publish?Type=Get&Target=Store&Name=State in a browser to browse valid paths. A wrong path returns null (blank).',
				},
				{
					id: 'target',
					type: 'textinput',
					label: 'Service',
					default: 'Store',
					tooltip: 'The service that holds the value. Usually Store.',
				},
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Store in variable',
					default: '',
					tooltip: 'A short name. The value is exposed as $(pixotope:prop_<name>). Defaults to the state path.',
				},
			],
			// No styling — the value is delivered through the variable.
			callback: () => ({}),
			subscribe: async (feedback) => {
				const name = (await self.parseVariablesInString(str(feedback.options.name))).trim()
				const target = str(feedback.options.target).trim() || 'Store'
				const label = str(feedback.options.variableName).trim() || name || 'value'
				self.registerPropertyFeedback(feedback.id, {
					kind: 'store',
					target,
					objectSearch: '',
					propertyPath: '',
					name,
					variableId: toVariableId(label),
					variableLabel: name || label,
				})
			},
			unsubscribe: (feedback) => {
				self.unregisterPropertyFeedback(feedback.id)
			},
		},
	})
}
