import {
  InlineBlockType,
  YBlocks, YChildrenMap,
  YSharedRoot,
  YDoc,
  YjsEditorKey,
  YMeta, YTextMap,
} from '@/application/document.type';
import { Element, Text } from 'slate';

interface BlockJson {
  id: string;
  ty: string;
  data?: string;
  children?: string;
  external_id?: string;
}

export function yDocToSlateContent (doc: YDoc, includeRoot?: boolean): Element | undefined {
  console.log(doc);
  const sharedRoot = doc.getMap(YjsEditorKey.data_section) as YSharedRoot;
  const document = sharedRoot.get(YjsEditorKey.document);
  const pageId = document.get(YjsEditorKey.page_id) as string;
  const blocks = document.get(YjsEditorKey.blocks) as YBlocks;
  const meta = document.get(YjsEditorKey.meta) as YMeta;
  const childrenMap = meta.get(YjsEditorKey.children_map) as YChildrenMap;
  const textMap = meta.get(YjsEditorKey.text_map) as YTextMap;

  function traverse (id: string) {
    const block = blocks.get(id).toJSON() as BlockJson;
    const childrenId = block.children as string;

    const children = (childrenMap.get(childrenId)?.toJSON() ?? []).map(traverse) as (Element | Text)[];

    const slateNode = blockToSlateNode(block);

    slateNode.children = children;

    const textId = block.external_id as string;

    if (!textId || id === pageId) {
      if (children.length === 0) {
        children.push({
          text: '',
        });
      }

      return slateNode;
    }

    try {
      const delta = textMap.get(textId)?.toDelta();
      const slateDelta = delta.flatMap(deltaInsertToSlateNode);
      const textNode: Element = {
        textId,
        type: YjsEditorKey.text,
        children: slateDelta,
      };

      children.unshift(textNode);
      return slateNode;
    } catch (e) {
      console.error(e);
      return;
    }
  }

  const root = blocks.get(pageId);

  if (!root) return;

  const result = traverse(pageId);

  if (!result) return;

  if (!includeRoot) {
    return result;
  }

  const { children, ...rootNode } = result;

  return {
    children: [
      {
        ...rootNode,
        children: [],
      },
      ...children,
    ],
  };
}

export function blockToSlateNode (block: BlockJson): Element {

  return {
    blockId: block.id,
    data: JSON.parse(block.data || ''),
    type: block.ty,
    children: [],
  };
}

export function deltaInsertToSlateNode ({
  attributes,
  insert,
}: {
  insert: string;
  attributes: Record<string, string | number | undefined | boolean>
}): Element | Text | Element[] {
  const matchInlines = transformToInlineElement({
    insert,
    attributes,

  });

  if (matchInlines.length > 0) {
    return matchInlines;
  }

  if (attributes) {
    if ('font_color' in attributes && attributes['font_color'] === '') {
      delete attributes['font_color'];
    }

    if ('bg_color' in attributes && attributes['bg_color'] === '') {
      delete attributes['bg_color'];
    }

    if ('code' in attributes && !attributes['code']) {
      delete attributes['code'];
    }
  }

  return {
    ...attributes,
    text: insert,
  };
}

export function transformToInlineElement (op: {
  insert: string;
  attributes: Record<string, string | number | undefined | boolean>
}): Element[] {
  const attributes = op.attributes;

  if (!attributes) return [];
  const { formula, mention, ...attrs } = attributes;

  if (formula) {
    const texts = (op.insert).split('');

    return texts.map((text) => {
      return {
        type: InlineBlockType.Formula,
        data: formula,
        children: [
          {
            text,
            ...attrs,
          },
        ],
      };
    });
  }

  if (mention) {
    const texts = (op.insert).split('');

    return texts.map((text) => {
      return {
        type: InlineBlockType.Mention,
        data: mention,
        children: [
          {
            text,
            ...attrs,
          },
        ],
      };
    });
  }

  return [];
}
