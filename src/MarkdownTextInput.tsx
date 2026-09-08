import {StyleSheet, TextInput, processColor} from 'react-native';
import React from 'react';
import type {TextInputProps} from 'react-native';
import {createSerializable, createWorkletRuntime} from 'react-native-worklets';
import type {SerializableRef, WorkletFunction, WorkletRuntime} from 'react-native-worklets';
import MarkdownTextInputDecoratorViewNativeComponent from './MarkdownTextInputDecoratorViewNativeComponent';
import type {MarkdownStyle} from './MarkdownTextInputDecoratorViewNativeComponent';
import NativeLiveMarkdownModule from './NativeLiveMarkdownModule';
import {mergeMarkdownStyleWithDefault} from './styleUtils';
import type {PartialMarkdownStyle} from './styleUtils';
import type {InlineImagesInputProps, MarkdownRange} from './commonTypes';

declare global {
  // eslint-disable-next-line no-var
  var jsi_setMarkdownRuntime: (runtime: WorkletRuntime) => void;
  // eslint-disable-next-line no-var
  var jsi_registerMarkdownWorklet: (shareableWorklet: SerializableRef<WorkletFunction<[string], MarkdownRange[]>>) => number;
  // eslint-disable-next-line no-var
  var jsi_unregisterMarkdownWorklet: (parserId: number) => void;
}

let initialized = false;
let workletRuntime: WorkletRuntime | undefined;

function getWorkletRuntime(): WorkletRuntime {
  if (workletRuntime === undefined) {
    throw new Error(
      "[react-native-live-markdown] Worklet runtime hasn't been created yet. Please avoid calling `getWorkletRuntime()` in top-level scope. Instead, call `getWorkletRuntime()` directly in `runOnRuntime` arguments list.",
    );
  }
  return workletRuntime;
}

function initializeLiveMarkdownIfNeeded() {
  if (initialized) {
    return;
  }
  if (NativeLiveMarkdownModule) {
    NativeLiveMarkdownModule.install();
  }
  if (!global.jsi_setMarkdownRuntime) {
    throw new Error('[react-native-live-markdown] global.jsi_setMarkdownRuntime is not available');
  }
  workletRuntime = createWorkletRuntime({name: 'LiveMarkdownRuntime'});
  global.jsi_setMarkdownRuntime(workletRuntime);
  initialized = true;
}

function registerParser(parser: (input: string) => MarkdownRange[]): number {
  initializeLiveMarkdownIfNeeded();
  const serializableWorklet = createSerializable(parser as WorkletFunction<[string], MarkdownRange[]>);
  const parserId = global.jsi_registerMarkdownWorklet(serializableWorklet);
  return parserId;
}

function unregisterParser(parserId: number) {
  global.jsi_unregisterMarkdownWorklet(parserId);
}

interface MarkdownTextInputProps extends TextInputProps, InlineImagesInputProps {
  markdownStyle?: PartialMarkdownStyle;
  formatSelection?: (text: string, selectionStart: number, selectionEnd: number, formatCommand: string) => FormatSelectionResult;
  parser: (value: string) => MarkdownRange[];
}

type FormatSelectionResult = {
  updatedText: string;
  cursorOffset: number;
};

type MarkdownTextInput = TextInput & React.Component<MarkdownTextInputProps>;

type ParserRegistration = {
  parser: MarkdownTextInputProps['parser'];
  parserId: number;
};

// The first registration happens in render so the first commit already carries a resolvable id. The layout effect
// re-registers after its own cleanup (StrictMode, a revealed `<Activity>`) and hands the fresh id to the decorator.
// `initialRegistrationRef` is never cleared, otherwise a render inside a hidden `<Activity>` would register again.
function useParserId(parser: MarkdownTextInputProps['parser']): number {
  const initialRegistrationRef = React.useRef<ParserRegistration | null>(null);
  if (initialRegistrationRef.current === null) {
    initialRegistrationRef.current = {parser, parserId: registerParser(parser)};
  }
  const [parserId, setParserId] = React.useState(initialRegistrationRef.current.parserId);
  const liveRegistrationRef = React.useRef<ParserRegistration | null>(initialRegistrationRef.current);

  React.useLayoutEffect(() => {
    const unregisterLiveParser = () => {
      if (liveRegistrationRef.current === null) {
        return;
      }
      unregisterParser(liveRegistrationRef.current.parserId);
      liveRegistrationRef.current = null;
    };

    if (liveRegistrationRef.current?.parser === parser) {
      return unregisterLiveParser;
    }

    unregisterLiveParser();
    const nextParserId = registerParser(parser);
    liveRegistrationRef.current = {parser, parserId: nextParserId};
    setParserId(nextParserId);
    return unregisterLiveParser;
  }, [parser]);

  return parserId;
}

function processColorsInMarkdownStyle(input: MarkdownStyle): MarkdownStyle {
  const output = JSON.parse(JSON.stringify(input));

  Object.keys(output).forEach((key) => {
    const obj = output[key];
    Object.keys(obj).forEach((prop) => {
      // TODO: use ReactNativeStyleAttributes from 'react-native/Libraries/Components/View/ReactNativeStyleAttributes'
      if (!(prop === 'color' || prop.endsWith('Color'))) {
        return;
      }
      obj[prop] = processColor(obj[prop]);
    });
  });

  return output as MarkdownStyle;
}

function processMarkdownStyle(input: PartialMarkdownStyle | undefined): MarkdownStyle {
  return processColorsInMarkdownStyle(mergeMarkdownStyleWithDefault(input));
}

const MarkdownTextInput = React.forwardRef<MarkdownTextInput, MarkdownTextInputProps>((props, ref) => {
  const markdownStyle = React.useMemo(() => processMarkdownStyle(props.markdownStyle), [props.markdownStyle]);

  if (props.parser === undefined) {
    throw new Error('[react-native-live-markdown] `parser` is undefined');
  }

  // eslint-disable-next-line no-underscore-dangle
  const workletHash = (props.parser as {__workletHash?: number}).__workletHash;
  if (workletHash === undefined) {
    throw new Error('[react-native-live-markdown] `parser` is not a worklet');
  }

  const parserId = useParserId(props.parser);

  return (
    <MarkdownTextInputDecoratorViewNativeComponent
      style={styles.displayContents}
      markdownStyle={markdownStyle}
      parserId={parserId}
    >
      <TextInput
        {...props}
        ref={ref}
      />
    </MarkdownTextInputDecoratorViewNativeComponent>
  );
});

const styles = StyleSheet.create({
  displayContents: {
    display: 'contents',
  },
});

export type {PartialMarkdownStyle as MarkdownStyle, MarkdownTextInputProps};

export default MarkdownTextInput;

export {getWorkletRuntime};
