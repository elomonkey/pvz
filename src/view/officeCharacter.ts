import type { PersonOptions, PersonRig } from './characters';
import { createStyledPerson } from './characterRig';

/** Compatibility entry point for the approved office prototype. */
export function createOfficePerson(options: PersonOptions): PersonRig {
  return createStyledPerson(options, 'office');
}
