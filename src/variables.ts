import type { CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main'

export function UpdateVariableDefinitions(self: ModuleInstance, propertyVariables?: ReadonlyMap<string, string>): void {
	const definitions: CompanionVariableDefinition[] = [
		{ variableId: 'connection_status', name: 'Gateway connection status' },
		{ variableId: 'gateway_url', name: 'Gateway publish URL' },
	]
	if (propertyVariables) {
		for (const [variableId, name] of propertyVariables) {
			definitions.push({ variableId, name })
		}
	}
	self.setVariableDefinitions(definitions)
}
