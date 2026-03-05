/**
 * Types of nodes in the FMEDA hierarchy.
 */
export type FmedaNodeType = 'System' | 'Subsystem' | 'Component' | 'Function' | 'FailureMode';

/**
 * Normalized node in the FMEDA data structure.
 * Supports System, Subsystem, Component, Function, and FailureMode types.
 */
export interface FmedaNode {
  id: string;
  /** The name or description of the node */
  name: string;
  /** The type of the node */
  type: FmedaNodeType;
  /** Reference to the parent node's ID */
  parentId: string | null;
  /** List of child node IDs */
  childIds: string[];

  // Failure Mode specific fields
  /** The local effect of the failure (FailureMode only) */
  localEffect?: string;
  /** The safety mechanism in place to detect or mitigate the failure (FailureMode only) */
  safetyMechanism?: string;
  /** Diagnostic coverage (0-1) (FailureMode only) */
  diagnosticCoverage?: number;
  /** FIT (Failures In Time) rate (FailureMode only) */
  fitRate?: number;
  /** Classification of the failure mode (FailureMode only) */
  classification?: 'Safe' | 'Dangerous';

  // Higher level specific fields (System, Subsystem, Component)
  /** Automotive Safety Integrity Level (System, Subsystem, Component only) */
  asil?: 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D';
  /** The safety goal associated with this node (System, Subsystem, Component only) */
  safetyGoal?: string;

  // Calculated fields (stored for easy access)
  /** Total FIT (Failures In Time) rate for this node and its descendants */
  totalFit?: number;
  /** Safe FIT rate (failures that do not lead to safety goal violation) */
  safeFit?: number;
  /** Dangerous FIT rate (failures that can lead to safety goal violation) */
  dangerousFit?: number;
  /** Average Diagnostic Coverage (0-1) for this node and its descendants */
  avgDc?: number;
}

/**
 * Represents a failure mode in the FMEDA analysis.
 * @deprecated Use FmedaNode with type 'FailureMode' instead.
 */
export interface FmedaFailureMode {
  id: string;
  /** The name or description of the failure mode */
  name: string;
  /** The local effect of the failure */
  localEffect: string;
  /** The safety mechanism in place to detect or mitigate the failure */
  safetyMechanism: string;
  /** Diagnostic coverage (0-1) */
  diagnosticCoverage: number;
  /** FIT (Failures In Time) rate */
  fitRate: number;
}

/**
 * Represents a function of a component.
 * @deprecated Use FmedaNode with type 'Function' instead.
 */
export interface FmedaFunction {
  id: string;
  /** The name of the function */
  name: string;
  /** List of failure modes associated with this function */
  failureModes: FmedaFailureMode[];
}

/**
 * Represents a component in the system.
 * @deprecated Use FmedaNode with type 'Component' instead.
 */
export interface FmedaComponent {
  id: string;
  /** The name of the component */
  name: string;
  /** List of functions associated with this component */
  functions: FmedaFunction[];
}
