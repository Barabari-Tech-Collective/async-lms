import * as React from "react";
import { composeRefs } from "@radix-ui/react-compose-refs";

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function createSlot(ownerName: string) {
  const SlotClone = createSlotClone(ownerName);
  const SlotComponent = React.forwardRef<any, any>((props, forwardedRef) => {
    const { children, ...slotProps } = props;
    const childrenArray = React.Children.toArray(children);
    const slottable = childrenArray.find(isSlottable) as any;
    if (slottable) {
      const newElement = slottable.props.children;
      const newChildren = childrenArray.map((child) => {
        if (child === slottable) {
          if (React.Children.count(newElement) > 1) return React.Children.only(null);
          return React.isValidElement(newElement) ? (newElement.props as any).children : null;
        } else {
          return child;
        }
      });
      return (
        <SlotClone {...slotProps} ref={forwardedRef}>
          {React.isValidElement(newElement) ? React.cloneElement(newElement, undefined, newChildren) : null}
        </SlotClone>
      );
    }
    return <SlotClone {...slotProps} ref={forwardedRef}>{children}</SlotClone>;
  });
  SlotComponent.displayName = `${ownerName}.Slot`;
  return SlotComponent;
}

export const Slot = createSlot("Slot");
export const Root = Slot;

function createSlotClone(ownerName: string) {
  const SlotClone = React.forwardRef<any, any>((props, forwardedRef) => {
    const { children, ...slotProps } = props;
    if (React.isValidElement(children)) {
      const childrenRef = getElementRef(children);
      const props2 = mergeProps(slotProps, children.props as any);
      if (children.type !== React.Fragment) {
        props2.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
      }
      return React.cloneElement(children, props2);
    }
    return React.Children.count(children) > 1 ? React.Children.only(null) : null;
  });
  SlotClone.displayName = `${ownerName}.SlotClone`;
  return SlotClone;
}

const SLOTTABLE_IDENTIFIER = Symbol("radix.slottable");

export function createSlottable(ownerName: string) {
  const SlottableComponent: React.FC<{ children?: React.ReactNode }> & { __radixId?: symbol } = ({ children }) => {
    return <>{children}</>;
  };
  SlottableComponent.displayName = `${ownerName}.Slottable`;
  SlottableComponent.__radixId = SLOTTABLE_IDENTIFIER;
  return SlottableComponent;
}

export const Slottable = createSlottable("Slottable");

function isSlottable(child: any): boolean {
  return React.isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && (child.type as any).__radixId === SLOTTABLE_IDENTIFIER;
}

function mergeProps(slotProps: Record<string, any>, childProps: Record<string, any>) {
  const overrideProps = { ...childProps };
  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];
    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: any[]) => {
          const result = childPropValue(...args);
          slotPropValue(...args);
          return result;
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    } else if (propName === "style") {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue };
    } else if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
    }
  }
  return { ...slotProps, ...overrideProps };
}

function getElementRef(element: React.ReactElement<any>) {
  let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
  let mayWarn = getter && "isReactWarning" in getter && (getter as any).isReactWarning;
  if (mayWarn) {
    return (element as any).ref;
  }
  getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
  mayWarn = getter && "isReactWarning" in getter && (getter as any).isReactWarning;
  if (mayWarn) {
    return element.props.ref;
  }
  return element.props.ref || (element as any).ref;
}

export default Slot;
