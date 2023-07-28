import Command from '@shopify/cli-kit/node/base-command';
import fs from 'fs/promises';
import {joinPath, resolvePath} from '@shopify/cli-kit/node/path';
import {capitalize} from '@shopify/cli-kit/common/string';
import {renderSuccess} from '@shopify/cli-kit/node/ui';
import {commonFlags} from '../../../lib/flags.js';
import {Args} from '@oclif/core';

type BaseFile = {
  name: string;
  source: string;
  description: string;
};

type Component = BaseFile & {
  type: 'component';
};

type SectionComponent = BaseFile & {
  schema: string;
  type: 'section';
  components?: Array<Component>;
};

export default class GenerateSection extends Command {
  static description = 'Generates a commerce component.';
  static flags = {
    adapter: commonFlags.adapter,
    typescript: commonFlags.typescript,
    force: commonFlags.force,
    path: commonFlags.path,
  };

  static hidden: true;

  static args = {
    sectionName: Args.string({
      name: 'sectionName',
      description: `The section to generate}.`,
      required: true,
      env: 'SHOPIFY_HYDROGEN_ARG_SECTION',
    }),
  };

  async run(): Promise<void> {
    const {
      flags,
      args: {sectionName},
    } = await this.parse(GenerateSection);

    const directory = flags.path ? resolvePath(flags.path) : process.cwd();

    await runGenerateComponent({
      ...flags,
      directory,
      sectionName: capitalize(sectionName.toLowerCase()),
    });
  }
}

interface GenerateComponentOptions {
  sectionName: string;
  directory: string;
  adapter?: string;
  typescript?: boolean;
  force?: boolean;
}

export async function runGenerateComponent({
  sectionName,
  directory,
  typescript,
}: GenerateComponentOptions) {
  const section = await downloadSection(sectionName);
  await writeSectionFiles({section, directory});
}

/**
 * Writes the files for a section the react component and its schema
 * @param section - The section to write files for
 * @param directory - The directory to write the files to
 * @example
 * ```ts
 * const section = await fetchSection('ImageText');
 * await writeSectionFiles({section, directory: '/Users/username/project'});
 * -> creates /Users/username/project/sections/ImageText.tsx and /Users/username/project/sections/ImageText.schema.ts
 * ```
 */
async function writeSectionFiles({
  section,
  directory,
}: {
  section: SectionComponent;
  directory: GenerateComponentOptions['directory'];
}) {
  const sectionsFolder = joinPath(directory, 'sections');
  const componentsFolder = joinPath(directory, 'components');

  // Create sections folder if it doesn't exist
  try {
    await fs.access(sectionsFolder, fs.constants.F_OK);
  } catch (error) {
    await fs.mkdir(sectionsFolder);
  }

  // write the section react component
  if (section.source) {
    await fs.writeFile(`${sectionsFolder}/${section.name}.tsx`, section.source);
    renderSuccess({
      headline: `Created section ${section.name} in ${sectionsFolder}`,
      body: {
        list: {
          items: [section.source],
        },
      },
    });
  }

  // write the section schema
  if (section.schema) {
    await fs.writeFile(
      `${sectionsFolder}/${section.name}.schema.ts`,
      section.schema,
    );
    renderSuccess({
      headline: `Created section schema ${section.name}.schema.ts in ${sectionsFolder}`,
      body: {
        list: {
          items: [section.schema],
        },
      },
    });
  }

  // (optional) write component dependencies if any
  if (section.components) {
    await Promise.all(
      section.components.map(async (component) => {
        await fs.writeFile(
          `${componentsFolder}/${component.name}.tsx`,
          component.source,
        );
        renderSuccess({
          headline: `Created component ${component.name} in ${componentsFolder}`,
          body: {
            list: {
              items: [component.source],
            },
          },
        });
      }),
    );
  }
}

/**
 * Generates a endpoint url to retrieve a component or a section from the registry
 * @param type - The type of asset to retrieve
 * @param name - The name of the asset to retrieve
 * @returns The url to retrieve the asset from
 * @example
 * ```ts
 * const sectionsUrls = getRegistryUrl({type: 'sections', name: 'Hero'});
 * -> returns 'https://hydrogen-ui-e3f48eed66654f1e6bd3.o2.myshopify.dev/sections/Hero.json'
 * ```
 */
function getRegistryUrl({
  type,
  name,
}: {
  type: 'sections' | 'components';
  name: string;
}) {
  if (!process.env.HYDROGEN_UI_URL) {
    throw new Error('HYDROGEN_REGISTRY_URL not found');
  }
  return `${process.env.HYDROGEN_UI_URL}/${type}/${name}.json`;
}

/**
 * Fetches a section from the registry
 * @param name - The name of the section to retrieve
 * @returns The section
 * @example
 * ```ts
 * const section = await fetchSection('ImageText');
 * -> {name: 'ImageText', type: 'section', source: '...', schema: '...', description: '...', components: [..]}
 * ```
 */
async function downloadSection(
  name: string,
): Promise<SectionComponent | never> {
  const sectionsUrl = getRegistryUrl({type: 'sections', name});
  const response = await fetch(sectionsUrl);

  renderSuccess({
    headline: `Downloading section ${name} from ${sectionsUrl}`,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch section');
  }

  const data = await response.json();

  if (typeof data !== 'object' || !data) {
    throw new Error('Invalid section');
  }

  return data as SectionComponent;
}

/**
 * Fetches a component from the registry
 * @param name - The name of the component to retrieve
 * @returns The component
 * @example
 * ```ts
 * const component = await fetchComponent('ProductCard');
 * -> returns {name: 'ProductCard', type: 'component', source: '...', description: '...'}
 * ```
 */
async function downloadComponent(name: string): Promise<Component | never> {
  const componentsUrl = getRegistryUrl({type: 'components', name});
  const response = await fetch(componentsUrl);

  if (!response.ok) {
    throw new Error('Failed to fetch component');
  }

  const data = await response.json();

  if (typeof data !== 'object' || !data) {
    throw new Error('Invalid component');
  }

  return data as Component;
}