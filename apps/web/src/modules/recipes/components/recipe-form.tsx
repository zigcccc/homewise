import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, TrashIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import {
  type Control,
  type FieldPath,
  type FieldPathValue,
  type SubmitHandler,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { toast } from 'sonner';
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
import { SELECT_NONE } from '@/modules/shared';

import { mealTypeLabels } from '../helpers';
import { type RecipeDetail } from '../recipes.queries';

export type RecipeFormValues = z.infer<typeof createRecipeModel>;

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
  onSubmit,
  recipe,
  submitLabel,
  tagSuggestions,
}: {
  cancelTo: React.ReactNode;
  ingredients: Ingredient[];
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

  /**
   * Drag-to-reorder for ingredient lines. The field array's `id` is the sortable id — the only
   * stable identity a line has, since the same library ingredient may legitimately appear twice in
   * one recipe. The order is committed on drop rather than on every `dragover`: dnd-kit already
   * animates the reorder optimistically, and moving the field array mid-drag would thrash the inputs.
   */
  const handleIngredientDragEnd = (event: DragEndEvent) => {
    const draggedId = event.operation.source?.id;

    if (event.canceled || draggedId === undefined) {
      return;
    }

    const ids = ingredientLines.fields.map((field) => field.id);
    const from = ids.indexOf(String(draggedId));
    const to = move(ids, event).indexOf(String(draggedId));

    if (from !== -1 && to !== -1 && from !== to) {
      ingredientLines.move(from, to);
    }
  };

  const ingredientsById = new Map(ingredients.map((item) => [item.id, item]));

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
                      onValueChange={(value) => field.onChange(value === SELECT_NONE ? null : value)}
                      value={field.value ?? SELECT_NONE}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <span>{field.value ? mealTypeLabels[field.value] : 'Not set'}</span>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE}>Not set</SelectItem>
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
              <DragDropProvider onDragEnd={handleIngredientDragEnd}>
                <ul className="space-y-3" data-testid="ingredient-lines">
                  {ingredientLines.fields.map((item, index) => (
                    <IngredientLineRow
                      control={form.control}
                      id={item.id}
                      index={index}
                      ingredientsById={ingredientsById}
                      key={item.id}
                      onRemove={() => ingredientLines.remove(index)}
                    />
                  ))}
                </ul>
              </DragDropProvider>
            )}
            <IngredientCombobox
              ingredients={ingredients}
              onSelect={(choice) => {
                ingredientLines.append({
                  // A brand-new ingredient carries its name instead of an id — the server creates it
                  // as part of saving the recipe, so nothing is persisted if this draft is abandoned.
                  ...(choice.kind === 'existing'
                    ? // Pre-fill the unit from the library so the common case needs no extra click.
                      { ingredientId: choice.ingredient.id, unit: choice.ingredient.defaultUnit }
                    : { ingredientName: choice.name, unit: null }),
                  quantity: null,
                  note: '',
                  section: '',
                });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
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
 * One ingredient line of the form. It's a component of its own because `useSortable` is a hook and
 * so can't be called from the parent's `.map` — which also means the two `useWatch` calls re-render
 * just this row on a keystroke instead of the entire form.
 */
function IngredientLineRow({
  control,
  id,
  index,
  ingredientsById,
  onRemove,
}: {
  control: Control<RecipeFormValues>;
  id: string;
  index: number;
  ingredientsById: Map<number, Ingredient>;
  onRemove: () => void;
}) {
  const ingredientId = useWatch({ control, name: `ingredients.${index}.ingredientId` });
  // A line points at the library either by id (already there) or by name (created when the recipe
  // is saved). Only the latter is still editable here.
  const typedName = useWatch({ control, name: `ingredients.${index}.ingredientName` });
  const name = ingredientId === undefined ? typedName : ingredientsById.get(ingredientId)?.name;

  // `index` is what makes the list sortable: dnd-kit reorders optimistically while dragging, and the
  // field array's order becomes the truth on drop.
  const { handleRef, isDragging, ref } = useSortable({ id, index });

  return (
    // `bg-card` so the lifted row isn't see-through over the ones it's passing.
    <li className={clsx('rounded-md border bg-card p-3', isDragging && 'shadow-md')} ref={ref}>
      <div className="mb-2 flex items-center gap-2">
        {/* A real button, not a decorative icon: it's what gives the row keyboard dragging (space to
            lift, arrows to move, space to drop). `touch-none` keeps a touch drag from scrolling. */}
        <button
          aria-label={`Reorder ${name || 'ingredient'}`}
          className="shrink-0 cursor-grab touch-none text-muted-foreground"
          ref={handleRef}
          type="button"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        {ingredientId === undefined ? (
          <FormField
            control={control}
            name={`ingredients.${index}.ingredientName`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel className="sr-only">Ingredient name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="h-8 font-medium"
                    placeholder="Name this ingredient"
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <span className="flex-1 font-medium text-sm">{name ?? 'Unknown ingredient'}</span>
        )}
        <Button
          aria-label={`Remove ${name || 'ingredient'}`}
          className="ml-auto shrink-0"
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <TrashIcon />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <NumberField
          control={control}
          label="Quantity"
          name={`ingredients.${index}.quantity`}
          placeholder="To taste"
          step="any"
        />
        <FormField
          control={control}
          name={`ingredients.${index}.unit`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(value === SELECT_NONE ? null : value)}
                value={field.value ?? SELECT_NONE}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <span>{field.value ? measurementUnitLabels[field.value] : '—'}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>—</SelectItem>
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
          control={control}
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
          control={control}
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

/** The server's per-tag length cap, mirrored so an over-long tag is rejected before it's submitted. */
const MAX_TAG_LENGTH = 32;

/**
 * Free-form tags. Tags travel as names — the server finds-or-creates them per household — so this is
 * a chip list over strings, with the household's existing vocabulary offered underneath.
 *
 * A tag commits on Enter, on a comma, or on blur, so a run of tags can be typed without reaching for
 * the mouse and `quick, dinner, easy` can be pasted in one go. The in-progress text is held by the
 * input itself rather than React state — the committed tags are the only thing worth re-rendering on.
 */
function TagField({ control, suggestions }: { control: Control<RecipeFormValues>; suggestions: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => {
        const value = field.value ?? [];

        const commit = (raw: string) => {
          const added: string[] = [];
          const tooLong: string[] = [];

          for (const candidate of raw.split(',')) {
            const trimmed = candidate.trim();

            if (!trimmed) {
              continue;
            }

            if (trimmed.length > MAX_TAG_LENGTH) {
              tooLong.push(trimmed);
              continue;
            }

            // Match the server's case-insensitive dedup — against the committed tags and against the
            // rest of this batch — so the chip list can't show both "Quick" and "quick".
            const isDuplicate = [...value, ...added].some((tag) => tag.toLowerCase() === trimmed.toLowerCase());
            if (!isDuplicate) {
              added.push(trimmed);
            }
          }

          if (inputRef.current) {
            inputRef.current.value = '';
          }

          if (tooLong.length > 0) {
            // Say so rather than dropping them silently — the array-item zod error has no
            // FormMessage of its own to surface in.
            toast.error(
              `${tooLong.length === 1 ? 'This tag is' : 'These tags are'} over ${MAX_TAG_LENGTH} characters: ${tooLong.join(', ')}`
            );
          }

          if (added.length > 0) {
            field.onChange([...value, ...added]);
          }
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
            <FormControl>
              <Input
                onBlur={(evt) => {
                  commit(evt.target.value);
                  field.onBlur();
                }}
                onChange={(evt) => {
                  // A typed comma never lands — the keydown handler eats it — so this is the paste path.
                  if (evt.target.value.includes(',')) {
                    commit(evt.target.value);
                  }
                }}
                onKeyDown={(evt) => {
                  // Enter would otherwise submit the whole recipe instead of committing the tag.
                  if (evt.key === 'Enter' || evt.key === ',') {
                    evt.preventDefault();
                    commit(evt.currentTarget.value);
                    return;
                  }

                  // Backspace on an empty input takes back the tag you just committed.
                  if (evt.key === 'Backspace' && evt.currentTarget.value === '' && value.length > 0) {
                    evt.preventDefault();
                    field.onChange(value.slice(0, -1));
                  }
                }}
                placeholder="e.g. weeknight"
                ref={inputRef}
              />
            </FormControl>
            <p className="text-muted-foreground text-xs">Press Enter or type a comma to add</p>
            {unused.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">Existing:</span>
                {unused.map((tag) => (
                  <button
                    className="cursor-pointer rounded-full border px-2 py-0.5 text-sm hover:bg-accent"
                    key={tag}
                    onClick={() => commit(tag)}
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
