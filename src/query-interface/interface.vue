<template>
  <div>
    <div style="display: flex; justify-content: space-between; gap: 2rem">
      <v-button @click="runQuery()" :disabled="!query">
        <v-icon name="play_arrow" /> Run
      </v-button>
      <div style="display: flex; gap: 2rem">
        <v-button @click="exportCSV()" secondary :disabled="!items?.length">
          <v-icon name="upload" /> Export CSV
        </v-button>
        <v-button @click="settingsOpen = true" secondary>
          <v-icon name="settings" /> Settings
        </v-button>
      </div>
    </div>

    <v-dialog v-model="settingsOpen">
      <v-card class="allow-drawer">
        <v-card-title>Display Settings</v-card-title>
        <v-card-text>
          <v-form
            :fields="settingsFields"
            :modelValue="value"
            @update:modelValue="emit('input', $event)"
          ></v-form>
        </v-card-text>
        <v-card-actions>
          <v-button @click="settingsOpen = false">Close</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <br />

    <div v-if="error">
      <h3>Error</h3>
      <v-error :error="error"></v-error>
    </div>

    <v-table
      v-model:headers="headers"
      :items="items"
      v-if="items?.length"
      fixed-header
      show-resize
      allow-header-reorder
      style="
        max-height: 75vh;
        margin-bottom: calc(var(--content-padding-bottom) * -1);
      "
    >
      <template
        v-for="header in headers"
        :key="header.value"
        #[`item.${header.value}`]="{ item }"
      >
        <render-display
          v-if="header?.field"
          :value="getValue(item[header.value], header?.field?.type)"
          :display="header.field?.meta?.display"
          :options="header.field?.meta?.display_options"
          :type="header.field?.type"
          :field="header.field?.field"
        />
        <span v-else>{{ item[header.value] }}</span>
      </template>
    </v-table>

    <v-notice v-if="items && !items?.length" type="success"
      >Query executed successfully with no rows returned.</v-notice
    >
  </div>
</template>

<script setup lang="ts">
import { inject, ref, computed, type Ref } from 'vue';
import { useSdk } from '@directus/extensions-sdk';
import { customEndpoint } from '@directus/sdk';
import Papa from 'papaparse';

const sdk = useSdk();

const settingsOpen = ref(false);
const settingsFields = [
  {
    field: 'headers',
    name: 'Headers',
    type: 'json',
    meta: {
      interface: 'field-config',
    },
  },
];

function getValue(value: any, type: string) {
  if (type !== 'dateTime' || !value) return value;
  return new Date(value).toISOString().slice(0, 19);
}

const props = withDefaults(
  defineProps<{
    value: any;
    sql_field: string;
    parameters_field: string;
  }>(),
  {
    value: {
      headers: {
        fields: [],
      },
    },
  },
);

const emit = defineEmits(['input']);

const values = inject('values') as Ref<Record<string, any>>;
const items: Ref<any[] | null> = ref(null);
const error: Ref<{ message: string; extensions: any } | null> = ref(null);

const query = computed(() => values.value[props.sql_field]);
const parameters = computed(() => values.value[props.parameters_field] || []);

const headers = computed({
  get: () => {
    if (!items.value) return [];
    const responseFields = Object.keys(items?.value?.[0] || {});

    const knownHeaders =
      props.value?.headers?.fields?.map((field: any) => {
        if (!field.field) return null;
        if (!responseFields.includes(field.field)) return null;

        return {
          text: field.name || field.field,
          value: field.field,
          field: field,
          width: field?.meta?.headerWidth,
          sortable: false,
        };
      }) || [];

    return knownHeaders.filter(Boolean);
  },
  set: (updatedHeaders) => {
    for (const header of updatedHeaders) {
      if (header?.field?.meta) header.field.meta.headerWidth = header.width;
    }

    props.value.headers.fields.sort((a, b) => {
      return (
        updatedHeaders.findIndex((h) => h.value === a.field) -
        updatedHeaders.findIndex((h) => h.value === b.field)
      );
    });

    emit('input', props.value);
  },
});

function exportCSV() {
  if (!items.value) return;
  const csv = Papa.unparse(items.value);

  const a = document.createElement('a');
  a.href = `data:text/csv;charset=utf-8,${csv}`;
  a.download = 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function runQuery() {
  error.value = null;
  items.value = null;

  if (!props.value) {
    emit('input', {
      headers: {
        fields: [],
      },
    });
  }

  const parametersObject: Record<string, string | number> = {};
  for (const parameter of parameters.value) {
    parametersObject[parameter.name] =
      parameter.type === 'number' ? +parameter.value : `${parameter.value}`;
  }

  try {
    const response: any[] = await sdk.request(
      customEndpoint<any[]>({
        path: '/query-endpoint',
        method: 'POST',
        body: JSON.stringify({
          query: query.value,
          parameters: parametersObject,
        }),
      }),
    );

    items.value = response;

    for (const field of Object.keys(response?.[0] || {})) {
      if (!props?.value?.headers?.fields?.find((f) => f.field === field)) {
        props.value.headers.fields.push({ field, meta: { field } });
      }
      emit('input', props.value);
    }
  } catch (e: any) {
    if (e?.errors?.error) error.value = e?.errors.error;
    else error.value = e;
  }
}
</script>
