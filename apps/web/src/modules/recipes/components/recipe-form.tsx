import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, TrashIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type Control,
  type FieldPath,
  type FieldPathValue,
  type SubmitHandler,
  useFieldArray,
  useForm,
} from 'react-hook-form';
import type z from 'zod';

import { measurementUnit } from '@homewise/server/ingredients';
import { createRecipeModel, mealType } from '@homewise/server/recipes';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Textarea,
} from '@homewise/ui/core';

import { type Ingredient, IngredientCombobox, measurementUnitLabels } from '@/modules/ingredients';

import { mealTypeLabels } from '../helpers';
import { type RecipeDetail } from '../recipes.queries';

export type RecipeFormValues = z.infer<typeof createRecipeModel>;

/** Radix Select can't hold an empty value, so "no choice" travels as this sentinel. */
const NONE = 'none';

function toDefaults(recipe?: RecipeDetail): RecipeFormValues {
  return {
    title: recipe?.title ?? '',
    description: recipe?.description ?? '',
    mealType: recipe?.mealType ?? null,
    cuisine: recipe?.cuisine ?? '',
    servings: recipe?.servings ?? null,
    prepTimeMinutes: recipe?.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe?.cookTimeMinutes ?? null,
    sourceName: recipe?.sourceName ?? '',
    sourceUrl: recipe?.sourceUrl ?? '',
    ingredients:
      recipe?.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        note: line.note ?? '',
        section: line.section ?? '',
      })) ?? [],
    steps: recipe?.steps.map((step) => ({ instruction: step.instruction })) ?? [],
    tags: recipe?.tags.map((tag) => tag.name) ?? [],
  };
}

/**
 * The full add/edit recipe form, shared by `/food/recipes/new` and `/food/recipes/$recipeId/edit`.
 * A recipe has far too many fields for a dialog, so this is a page-level form; the caller owns which
 * endpoint `onSubmit` hits and where to navigate afterwards.
 *
 * Ingredients and steps are ordered arrays — the server derives each row's `position` from the array
 * order, so reordering here is just reordering the field array.
 */
export function RecipeForm({
  cancelTo,
  ingredients,
  onIngredientCreated,
  onSubmit,
  recipe,
  submitLabel,
  tagSuggestions,
}: {
  cancelTo: React.ReactNode;
  ingredients: Ingredient[];
  onIngredientCreated: () => void;
  onSubmit: (values: RecipeFormValues) => Promise<void>;
  recipe?: RecipeDetail;
  submitLabel: string;
  tagSuggestions: string[];
}) {
  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(createRecipeModel),
    defaultValues: toDefaults(recipe),
  });

  const ingredientLines = useFieldArray({ control: form.control, name: 'ingredients' });
  const steps = useFieldArray({ control: form.control, name: 'steps' });

  const submit: SubmitHandler<RecipeFormValues> = async (values) => {
    await onSubmit(values);
  };

  // Ingredients picked in this session, so a row can label itself before the library query catches up.
  const [justCreated, setJustCreated] = useState<Ingredient[]>([]);
  const ingredientsById = new Map([...justCreated, ...ingredients].map((item) => [item.id, item]));

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
        <Card>
          <CardHeader>
            <CardTitle>The basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Grandma's apple pie" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="A line about what this is" value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mealType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meal type</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                      value={field.value ?? NONE}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <span>{field.value ? mealTypeLabels[field.value] : 'Not set'}</span>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {mealType.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {mealTypeLabels[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cuisine"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuisine</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Italian" value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField control={form.control} label="Servings" name="servings" placeholder="4" />
              <NumberField control={form.control} label="Prep time (min)" name="prepTimeMinutes" placeholder="15" />
              <NumberField control={form.control} label="Cook time (min)" name="cookTimeMinutes" placeholder="30" />
            </div>
            <TagField control={form.control} suggestions={tagSuggestions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ingredientLines.fields.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No ingredients yet. Add them from your library, or create a new one as you go.
              </p>
            ) : (
              <ul className="space-y-3">
                {ingredientLines.fields.map((item, index) => {
                  const ingredientId = form.watch(`ingredients.${index}.ingredientId`);
                  const ingredient = ingredientId === undefined ? undefined : ingredientsById.get(ingredientId);

                  return (
                    <li className="rounded-md border p-3" key={item.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-sm">{ingredient?.name ?? 'Unknown ingredient'}</span>
                        <Button
                          aria-label={`Remove ${ingredient?.name ?? 'ingredient'}`}
                          className="ml-auto shrink-0"
                          onClick={() => ingredientLines.remove(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <NumberField
                          control={form.control}
                          label="Quantity"
                          name={`ingredients.${index}.quantity`}
                          placeholder="To taste"
                          step="any"
                        />
                        <FormField
                          control={form.control}
                          name={`ingredients.${index}.unit`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Unit</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                                value={field.value ?? NONE}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <span>{field.value ? measurementUnitLabels[field.value] : '—'}</span>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value={NONE}>—</SelectItem>
                                  {measurementUnit.options.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {measurementUnitLabels[option]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`ingredients.${index}.note`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Note</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="finely chopped" value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`ingredients.${index}.section`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="For the sauce" value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <IngredientCombobox
              ingredients={ingredients}
              onCreated={onIngredientCreated}
              onSelect={(ingredient) => {
                // Remember it locally as well: for a just-created ingredient the library refetch is
                // in flight, so without this the new row would read "Unknown ingredient" until it lands.
                setJustCreated((current) =>
                  current.some((item) => item.id === ingredient.id) ? current : [...current, ingredient]
                );
                ingredientLines.append({
                  ingredientId: ingredient.id,
                  quantity: null,
                  // Pre-fill from the library so the common case needs no extra click.
                  unit: ingredient.defaultUnit,
                  note: '',
                  section: '',
                });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.fields.length === 0 ? (
              <p className="text-muted-foreground text-sm">No steps yet.</p>
            ) : (
              <ol className="space-y-2">
                {steps.fields.map((item, index) => (
                  <li className="flex items-start gap-2" key={item.id}>
                    <span className="mt-2 w-6 shrink-0 text-center font-medium text-muted-foreground text-sm">
                      {index + 1}.
                    </span>
                    <FormField
                      control={form.control}
                      name={`steps.${index}.instruction`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Textarea {...field} placeholder="What happens in this step?" rows={2} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex shrink-0 flex-col">
                      <Button
                        aria-label={`Move step ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => steps.swap(index, index - 1)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        aria-label={`Move step ${index + 1} down`}
                        disabled={index === steps.fields.length - 1}
                        onClick={() => steps.swap(index, index + 1)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDownIcon />
                      </Button>
                    </div>
                    <Button
                      aria-label={`Remove step ${index + 1}`}
                      className="shrink-0"
                      onClick={() => steps.remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <Button onClick={() => steps.append({ instruction: '' })} size="sm" type="button" variant="outline">
              Add step
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sourceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Grandma's notebook" value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sourceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link</FormLabel>
                  <FormControl>
                    {/* Plain text (not type="url") so a bare domain isn't blocked by native
                        validation before the schema prepends https://. */}
                    <Input {...field} placeholder="https://…" value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {cancelTo}
          <Button loading={form.formState.isSubmitting} type="submit">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Every path in the form whose value is numeric — `servings`, `prepTimeMinutes`,
 * `ingredients.${number}.quantity` and friends. Narrowing `NumberField`'s `name` to these means a
 * typo'd or non-numeric path is a compile error rather than a field that silently binds nothing.
 */
type NumericFieldPath = {
  [K in FieldPath<RecipeFormValues>]: FieldPathValue<RecipeFormValues, K> extends number | null | undefined ? K : never;
}[FieldPath<RecipeFormValues>];

/**
 * A numeric form field. Native number inputs hand back strings, and the schema wants a number or
 * null, so the conversion lives here rather than being repeated at seven call sites.
 */
function NumberField({
  control,
  label,
  name,
  placeholder,
  step,
}: {
  control: Control<RecipeFormValues>;
  label: string;
  name: NumericFieldPath;
  placeholder?: string;
  step?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              min={0}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(evt) => field.onChange(evt.target.value === '' ? null : Number(evt.target.value))}
              placeholder={placeholder}
              ref={field.ref}
              step={step}
              type="number"
              // Safe by construction: NumericFieldPath admits only numeric paths, but RHF widens
              // `field.value` to the union of every field's type across the form.
              value={(field.value as number | null | undefined) ?? ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Free-form tags. Tags travel as names — the server finds-or-creates them per household — so this is
 * a chip list over strings, with the household's existing vocabulary offered underneath.
 */
function TagField({ control, suggestions }: { control: Control<RecipeFormValues>; suggestions: string[] }) {
  const [draft, setDraft] = useState('');

  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => {
        const value = field.value ?? [];

        const add = (name: string) => {
          const trimmed = name.trim();
          // Match the server's case-insensitive dedup, so the chip list can't show "Quick" and "quick".
          if (!trimmed || value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
            setDraft('');
            return;
          }

          field.onChange([...value, trimmed]);
          setDraft('');
        };

        const unused = suggestions.filter(
          (tag) => !value.some((selected) => selected.toLowerCase() === tag.toLowerCase())
        );

        return (
          <FormItem>
            <FormLabel>Tags</FormLabel>
            {value.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {value.map((tag) => (
                  <li
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm"
                    key={tag.toLowerCase()}
                  >
                    {tag}
                    <button
                      aria-label={`Remove tag ${tag}`}
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => field.onChange(value.filter((item) => item !== tag))}
                      type="button"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <FormControl>
                <Input
                  aria-label="Add tag"
                  // Mirrors the server's per-tag limit, so an over-long tag can't be entered at all —
                  // a per-item zod error has no FormMessage of its own to render into.
                  maxLength={32}
                  onBlur={field.onBlur}
                  onChange={(evt) => setDraft(evt.target.value)}
                  onKeyDown={(evt) => {
                    // Enter would otherwise submit the whole recipe instead of committing the tag.
                    if (evt.key === 'Enter') {
                      evt.preventDefault();
                      add(draft);
                    }
                  }}
                  placeholder="e.g. weeknight"
                  value={draft}
                />
              </FormControl>
              <Button onClick={() => add(draft)} type="button" variant="outline">
                Add tag
              </Button>
            </div>
            {unused.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">Existing:</span>
                {unused.map((tag) => (
                  <button
                    className="cursor-pointer rounded-full border px-2 py-0.5 text-sm hover:bg-accent"
                    key={tag}
                    onClick={() => add(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
