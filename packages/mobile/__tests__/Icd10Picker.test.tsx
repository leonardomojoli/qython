/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import Icd10Picker from '../src/components/ambulatory/Icd10Picker';
import { searchIcd10 } from '../src/services/ambulatory';

jest.mock('../src/services/ambulatory', () => ({ searchIcd10: jest.fn() }));

const I10 = { code: 'I10', description: 'Hipertensão essencial (primária)' };
const I15 = { code: 'I15.0', description: 'Hipertensão renovascular' };

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children);

beforeEach(() => {
  jest.useFakeTimers();
  (searchIcd10 as jest.Mock).mockReset().mockResolvedValue([I10, I15]);
});

afterEach(() => {
  jest.useRealTimers();
});

test('busca na tabela oficial e devolve o código escolhido', async () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Icd10Picker selected={[]} onChange={onChange} />);
  });

  await ReactTestRenderer.act(() => {
    tree.root.findByType(TextInput).props.onChangeText('h');
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(300);
  });
  // Menos de 2 caracteres não busca.
  expect(searchIcd10).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    tree.root.findByType(TextInput).props.onChangeText('hipert');
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(searchIcd10).toHaveBeenCalledWith('hipert');
  expect(texts(tree)).toEqual(expect.arrayContaining(['I10', 'I15.0']));

  await ReactTestRenderer.act(() => {
    tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith([I10]);
});

test('mostra os escolhidos sem repeti-los na busca e permite remover', async () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Icd10Picker selected={[I10]} onChange={onChange} />);
  });
  await ReactTestRenderer.act(() => {
    tree.root.findByType(TextInput).props.onChangeText('hipertensao');
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(300);
  });

  // I10 aparece uma vez, no chip; a busca só oferece o I15.0.
  expect(texts(tree).filter(t => t === 'I10')).toHaveLength(1);
  expect(texts(tree)).toContain('I15.0');

  // O primeiro botão é o "remover" do chip do I10.
  await ReactTestRenderer.act(() => {
    tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith([]);
});

test('esconde a busca quando chega ao limite de códigos', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Icd10Picker selected={[I10, I15]} onChange={jest.fn()} maxSelections={2} />,
    );
  });
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});
