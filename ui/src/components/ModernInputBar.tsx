import React from 'react';
import { InputBar } from './InputBar';
import type { InputBarProps } from './InputBar';

export { InputBar };
export type { InputBarProps };

/**
 * Backward compatibility alias for InputBar.
 * User-facing occurrences have been renamed to Input Bar.
 */
export const ModernInputBar: React.FC<InputBarProps> = (props) => {
  return <InputBar {...props} />;
};

export type Props = InputBarProps;
