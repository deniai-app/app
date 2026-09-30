"use client";

import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";

function Slot({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  children?: React.ReactNode;
}) {
  if (!React.isValidElement(children)) {
    return null;
  }

  return React.cloneElement(
    children,
    mergeProps(
      props,
      children.props as React.ComponentPropsWithRef<React.ElementType>,
    ) as Partial<unknown> & React.Attributes,
  );
}

function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T | undefined;
  defaultProp: T;
  onChange?: (value: T, ...args: any[]) => void;
}) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultProp as T);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledValue;

  const setValue = (nextValue: React.SetStateAction<T>) => {
    const resolvedValue =
      typeof nextValue === "function" ? (nextValue as (currentValue: T) => T)(value) : nextValue;

    if (!Object.is(value, resolvedValue)) {
      if (!isControlled) {
        setUncontrolledValue(resolvedValue);
      }

      onChange?.(resolvedValue);
    }
  };

  return [value, setValue] as const;
}

export { Slot, useControllableState };
