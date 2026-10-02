"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type FormHTMLAttributes,
  type ReactNode,
  type ReactElement,
} from "react";
import { validDate } from "../lib/compliance";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function validate(control: Control): string {
  const value = control.value.trim();
  if (
    control instanceof HTMLInputElement &&
    ["checkbox", "file", "hidden"].includes(control.type)
  )
    return "";
  if (control.required && !value) return "This field is required.";
  if (!value) return "";
  if (control instanceof HTMLInputElement) {
    if (control.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) return "Enter a valid number.";
      if (control.min && n < Number(control.min))
        return `Enter a value of at least ${control.min}.`;
      if (control.max && n > Number(control.max))
        return `Enter a value no greater than ${control.max}.`;
      if (control.validity.stepMismatch)
        return control.step === "1"
          ? "Enter a whole number."
          : `Use increments of ${control.step || "1"}.`;
    }
    if (control.type === "date" && !validDate(value))
      return "Enter a valid date of birth that is not in the future.";
    if (
      ["first", "middle", "last", "name"].includes(control.name) &&
      !/[\p{L}]/u.test(value)
    )
      return "Enter a name containing letters.";
  }
  if (
    "maxLength" in control &&
    control.maxLength > 0 &&
    value.length > control.maxLength
  )
    return `Use ${control.maxLength} characters or fewer.`;
  if (!control.validity.valid) return "Enter a valid value.";
  return "";
}
export default function ValidatedForm({
  children,
  onSubmit,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const prefix = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const enhance = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const el = node as ReactElement<{
        children?: ReactNode;
        name?: string;
        id?: string;
      }>;
      if (
        el.type === "input" ||
        el.type === "select" ||
        el.type === "textarea"
      ) {
        const name = el.props.name;
        if (!name) return node;
        return cloneElement(el, {
          id: el.props.id || `${prefix}-${name}`,
          ...({
            "aria-invalid": !!errors[name],
            "aria-describedby": errors[name]
              ? `${prefix}-${name}-error`
              : undefined,
          } as object),
        });
      }
      const enhanced = cloneElement(el, {}, enhance(el.props.children));
      if (el.type === "label") {
        const controls: string[] = [];
        const find = (items: ReactNode) =>
          Children.forEach(items, (item) => {
            if (isValidElement(item)) {
              const p = item.props as {
                name?: string;
                children?: ReactNode;
              };
              if (p.name) controls.push(p.name);
              find(p.children);
            }
          });
        find(el.props.children);
        return (
          <div className="validated-field">
            {enhanced}
            {controls
              .filter((name) => errors[name])
              .map((name) => (
                <p
                  className="field-error"
                  id={`${prefix}-${name}-error`}
                  key={name}
                >
                  {errors[name]}
                </p>
              ))}
          </div>
        );
      }
      return enhanced;
    });
  return (
    <form
      {...props}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const next: Record<string, string> = {};
        Array.from(form.elements).forEach((el) => {
          if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement
          ) {
            const error = validate(el);
            if (error) next[el.name] = error;
          }
        });
        const data = new FormData(form);
        const name = ["first", "middle", "last"]
          .map((k) => String(data.get(k) || "").trim())
          .filter(Boolean)
          .join(" ");
        if (name.length > 200)
          next.last = "The combined full name must be 200 characters or fewer.";
        setErrors(next);
        if (Object.keys(next).length) {
          (form.elements.namedItem(Object.keys(next)[0]) as Control)?.focus();
          return;
        }
        onSubmit?.(e);
      }}
      onChange={(e) => {
        props.onChange?.(e);
        const el = e.target;
        if (
          (el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement) &&
          errors[el.name]
        )
          setErrors((current) => ({ ...current, [el.name]: validate(el) }));
      }}
    >
      {Object.values(errors).some(Boolean) && (
        <div className="validation-summary" role="alert">
          Please correct the highlighted fields before continuing.
        </div>
      )}
      {enhance(children)}
    </form>
  );
}
