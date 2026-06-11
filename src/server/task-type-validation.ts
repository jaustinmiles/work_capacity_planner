/**
 * Task type validation at the server trust boundary.
 *
 * Task.type / TaskStep.type are plain String columns with no FK to UserTaskType,
 * so any unchecked write persists an orphan type that matches no schedule block
 * and renders typeless in every client. Every mutation that accepts a `type`
 * must assert it references a UserTaskType belonging to the owning session
 * (UserTaskType is session-scoped, so a cross-session type id is just as
 * invalid as a hallucinated one).
 */

import { TRPCError } from '@trpc/server'
import type { Context } from './trpc'

/** A task-type reference found in a mutation input, tagged with its input path for error messages. */
export interface TaskTypeRef {
  typeId: string
  fieldPath: string
}

/**
 * Assert that every referenced task type exists in the given session.
 * Throws TRPCError BAD_REQUEST listing each invalid reference.
 *
 * A null sessionId (legacy session-less Task rows) has no valid types by
 * definition, so any type reference against it is rejected. Callers must only
 * validate fields actually present in the input, so type-less updates to
 * legacy rows keep working.
 */
export async function assertValidTaskTypes(
  prisma: Context['prisma'],
  sessionId: string | null,
  refs: ReadonlyArray<TaskTypeRef>,
): Promise<void> {
  if (refs.length === 0) return

  if (!sessionId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot validate task type reference(s) ${refs
        .map((ref) => ref.fieldPath)
        .join(', ')}: the target has no session to resolve user-defined task types against`,
    })
  }

  const distinctIds = [...new Set(refs.map((ref) => ref.typeId))]
  const found = await prisma.userTaskType.findMany({
    where: { id: { in: distinctIds }, sessionId },
    select: { id: true },
  })
  const validIds = new Set(found.map((taskType) => taskType.id))
  const invalid = refs.filter((ref) => !validIds.has(ref.typeId))

  if (invalid.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Unknown task type(s): ${invalid
        .map((ref) => `${ref.fieldPath}='${ref.typeId}'`)
        .join(', ')}. Task types must exist in the session before they can be referenced.`,
    })
  }
}

/**
 * Assert that a single task type id exists in the given session.
 * Throws TRPCError BAD_REQUEST when it does not.
 */
export async function assertValidTaskType(
  prisma: Context['prisma'],
  sessionId: string | null,
  typeId: string,
  fieldPath: string,
): Promise<void> {
  await assertValidTaskTypes(prisma, sessionId, [{ typeId, fieldPath }])
}
