import { defineInterface } from '@directus/extensions-sdk'
import InterfaceComponent from './interface.vue'

export default defineInterface({
  id: 'query-interface',
  name: 'SQL Query Interface',
  icon: 'table',
  description: 'Display the results of running SQL queries.',
  component: InterfaceComponent,
  types: ['json'],
  group: 'other',
  options: [
    {
      field: 'sql_field',
      type: 'string',
      name: 'SQL Field (String/Text)',
      meta: {
        width: 'full',
        interface: 'input',
        note: 'Field to pull SQL query from',
      },
    },
    {
      field: 'parameters_field',
      type: 'string',
      name: 'Parameters Field (JSON)',
      meta: {
        width: 'half',
        interface: 'input',
        note: 'Field to pull SQL parameters from',
      },
    },
  ],
})
