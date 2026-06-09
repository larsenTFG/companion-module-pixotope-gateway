import type { CompanionInputFieldTextInput } from '@companion-module/base'
import type { ModuleInstance } from './main'
import { extractFailure, extractProperty, formatPropertyValue, formatResult, parseGatewayUrl } from './api'

type OptionValue = string | number | boolean | Array<string | number> | undefined

/** Coerce an option value to a string. */
function str(value: OptionValue): string {
	if (value === undefined || value === null) return ''
	if (Array.isArray(value)) return value.join(',')
	return String(value)
}

/** Parse a user-entered string as JSON, falling back to the raw string if it isn't valid JSON. */
function coerceValue(raw: string): unknown {
	const trimmed = raw.trim()
	if (trimmed === '') return ''
	try {
		return JSON.parse(trimmed)
	} catch {
		return raw
	}
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

/** Parse a user-entered string as a JSON object, returning {} when empty or invalid. */
function parseParams(self: ModuleInstance, raw: string, fieldName: string): Record<string, unknown> {
	const trimmed = raw.trim()
	if (trimmed === '') return {}
	try {
		const parsed: unknown = JSON.parse(trimmed)
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>
		}
		self.log('warn', `${fieldName} must be a JSON object; got ${typeof parsed}. Sending empty object.`)
	} catch {
		self.log('warn', `${fieldName} is not valid JSON. Sending empty object.`)
	}
	return {}
}

export function UpdateActions(self: ModuleInstance): void {
	const engineTarget = (value: OptionValue): string => str(value).trim() || self.config.defaultEngine

	/**
	 * Resolve the target / object search / property path for the property actions
	 * from a pasted editor URL. Returns undefined (already logged) when the URL is
	 * missing or unparseable.
	 */
	const resolveProperty = async (
		action: { options: Record<string, OptionValue> },
		context: { parseVariablesInString: (text: string) => Promise<string> },
	): Promise<{ target: string; objectSearch: string; propertyPath: string } | undefined> => {
		const url = (await context.parseVariablesInString(str(action.options.url))).trim()
		if (url === '') {
			self.log('warn', 'Property action: no editor URL provided.')
			return undefined
		}
		try {
			const parsed = parseGatewayUrl(url)
			const params = parsed.Message?.Params ?? {}
			return {
				target: parsed.Topic.Target || self.config.defaultEngine,
				objectSearch: formatResult(params.ObjectSearch),
				propertyPath: formatResult(params.PropertyPath),
			}
		} catch (e) {
			self.log('error', `Property action: ${e instanceof Error ? e.message : String(e)}`)
			return undefined
		}
	}

	const urlField: CompanionInputFieldTextInput = {
		id: 'url',
		type: 'textinput',
		label: 'Editor URL',
		default: '',
		useVariables: true,
		tooltip:
			'Right-click the property in the Pixotope editor, copy its URL, and paste it here, e.g. …?Type=Call&Target=~LOCAL~-Engine&Method=GetProperty&ParamObjectSearch=DirectionalLight_0.LightComponent0&ParamPropertyPath=Intensity',
	}

	self.setActionDefinitions({
		set_property: {
			name: 'Engine: Set Property',
			description:
				'Set a property value on an actor. Paste the URL copied from the editor right-click menu and just add the value — no need to fill in fields one by one.',
			options: [
				urlField,
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					useVariables: true,
					tooltip:
						'The value to send. Any value embedded in the pasted URL is ignored — set it here. Plain text, number, or JSON (auto-detected, e.g. {"R":1,"G":0,"B":0}).',
				},
				{
					id: 'isAdjustment',
					type: 'checkbox',
					label: 'Persist as adjustment',
					default: false,
					tooltip: 'When enabled, the change is saved persistently (IsAdjustment).',
				},
			],
			callback: async (action, context) => {
				const resolved = await resolveProperty(action, context)
				if (!resolved) return
				await self.sendRequest({
					Topic: { Type: 'Call', Target: resolved.target, Method: 'SetProperty' },
					Message: {
						Params: {
							ObjectSearch: resolved.objectSearch,
							PropertyPath: resolved.propertyPath,
							Value: coerceValue(await context.parseVariablesInString(str(action.options.value))),
							IsAdjustment: Boolean(action.options.isAdjustment),
						},
					},
				})
			},
		},

		get_property: {
			name: 'Engine: Get Property (→ variable)',
			description:
				'Read a property value into a Companion variable for display or feedback. Paste the URL copied from the editor right-click menu.',
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
			callback: async (action, context) => {
				const resolved = await resolveProperty(action, context)
				if (!resolved) return
				const { target, objectSearch, propertyPath } = resolved
				const response = await self.sendRequest({
					Topic: { Type: 'Call', Target: target, Method: 'GetProperty' },
					Message: { Params: { ObjectSearch: objectSearch, PropertyPath: propertyPath } },
				})
				if (!response) return
				const failure = extractFailure(response.body)
				if (failure) {
					self.log('warn', `GetProperty ${objectSearch}.${propertyPath} failed: ${failure}`)
					return
				}
				const property = extractProperty(response.body)
				const value = formatPropertyValue(property)
				const label = str(action.options.variableName).trim() || property?.Name || propertyPath || 'value'
				const variableId = toVariableId(label)
				self.setPropertyVariable(variableId, `${objectSearch} ${propertyPath}`.trim() || label, value)
				self.log('debug', `GetProperty ${objectSearch}.${propertyPath} -> ${value} ($(pixotope:${variableId}))`)
			},
		},

		call_event: {
			name: 'Engine: Call Event (Blueprint)',
			description:
				'Execute a Blueprint event (CallFunction). Paste the URL copied from the Pixotope editor. To pass arguments, add ParamFunctionArguments as a JSON array with text values quoted, e.g. [10,"HELLO"].',
			options: [
				{
					id: 'url',
					type: 'textinput',
					label: 'Editor URL',
					default: '',
					useVariables: true,
					tooltip:
						'Paste the CallFunction URL from the editor, e.g. …&Method=CallFunction&ParamObjectSearch=BP_test_C_1&ParamFunctionName=PX_showMe. Arguments: append &ParamFunctionArguments=[10,"HELLO"] — a JSON array, text values must be quoted.',
				},
			],
			callback: async (action, context) => {
				const url = (await context.parseVariablesInString(str(action.options.url))).trim()
				if (url === '') {
					self.log('warn', 'Call Event: no URL provided.')
					return
				}
				try {
					await self.sendRequest(parseGatewayUrl(url))
				} catch (e) {
					self.log('error', `Call Event: ${e instanceof Error ? e.message : String(e)}`)
				}
			},
		},

		set_store: {
			name: 'Store: Set Value',
			description: 'Set a value in the Pixotope Store (show-wide settings).',
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'State Path',
					default: '',
					useVariables: true,
					tooltip: 'e.g. State.General.CompositingColorSpace',
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					useVariables: true,
					tooltip: 'Plain text, number, or JSON (auto-detected).',
				},
			],
			callback: async (action, context) => {
				await self.sendRequest({
					Topic: {
						Type: 'Set',
						Target: 'Store',
						Name: await context.parseVariablesInString(str(action.options.name)),
					},
					Message: { Value: coerceValue(await context.parseVariablesInString(str(action.options.value))) },
				})
			},
		},

		raw_request: {
			name: 'Raw API Request',
			description: 'Send any Topic/Message to Gateway. Paste payloads captured from the Director API Log.',
			options: [
				{
					id: 'type',
					type: 'dropdown',
					label: 'Topic Type',
					default: 'Call',
					choices: [
						{ id: 'Set', label: 'Set' },
						{ id: 'Get', label: 'Get' },
						{ id: 'Call', label: 'Call' },
						{ id: 'Update', label: 'Update' },
					],
				},
				{ id: 'target', type: 'textinput', label: 'Target', default: '', useVariables: true },
				{
					id: 'name',
					type: 'textinput',
					label: 'Name (for Set/Get)',
					default: '',
					useVariables: true,
				},
				{
					id: 'method',
					type: 'textinput',
					label: 'Method (for Call)',
					default: '',
					useVariables: true,
				},
				{
					id: 'message',
					type: 'textinput',
					label: 'Message (JSON object)',
					default: '{}',
					useVariables: true,
					tooltip: 'The full Message object, e.g. {"Params":{...}} or {"Value":...}',
				},
			],
			callback: async (action, context) => {
				const type = str(action.options.type) as 'Set' | 'Get' | 'Call' | 'Update'
				const name = (await context.parseVariablesInString(str(action.options.name))).trim()
				const method = (await context.parseVariablesInString(str(action.options.method))).trim()
				const message = parseParams(self, await context.parseVariablesInString(str(action.options.message)), 'Message')
				await self.sendRequest({
					Topic: {
						Type: type,
						Target: engineTarget(await context.parseVariablesInString(str(action.options.target))),
						...(name ? { Name: name } : {}),
						...(method ? { Method: method } : {}),
					},
					Message: message,
				})
			},
		},

		clear_variables: {
			name: 'Clear stored property variables',
			description:
				'Remove all $(pixotope:prop_*) variables created by Get Property / Watch property. Live Watch variables repopulate on their next poll.',
			options: [],
			callback: () => {
				self.clearPropertyVariables()
			},
		},
	})
}
