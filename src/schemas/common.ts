import { z } from 'zod';

/**
 * Regex pattern for Kafka topic validation.
 * Format: <namespace>.(completed|failure|execute).<action>
 * Examples: users.execute.create, sandbox.success.create, executor.failure.test
 */
const TOPIC_REGEX = /^[\w\-\/:]+\.(success|failure|execute)\.[\w\-\/:]+$/;

const SUCCESS_TOPIC_REGIX = /^[\w\-\/:]+\.(success)\.[\w\-\/:]+$/;
const FAILURE_TOPIC_REGIX = /^[\w\-\/:]+\.(failure)\.[\w\-\/:]+$/;
const EXECUTE_TOPIC_REGIX = /^[\w\-\/:]+\.(execute)\.[\w\-\/:]+$/;

/**
 * Shared schema for Kafka topic validation.
 * Ensures consistent topic naming across workflow and step configurations.
 */
export const TopicSchema = z
  .string()
  .regex(
    TOPIC_REGEX,
    'Invalid topic format. Expected format: <namespace>.(success|failure|execute).<action>'
  );

/**
 * Schema for success topic validation.
 * Ensures topic is a success topic.
 */
export const SuccessTopicSchema = z
  .string()
  .regex(
    SUCCESS_TOPIC_REGIX,
    'Invalid success topic format. Expected: <namespace>.success.<action>'
  );

/**
 * Schema for failure topic validation.
 * Ensures topic is a failure topic.
 */
export const FailureTopicSchema = z
  .string()
  .regex(
    FAILURE_TOPIC_REGIX,
    'Invalid failure topic format. Expected: <namespace>.failure.<action>'
  );

/**
 * Schema for execute topic validation.
 * Ensures topic is an execute topic.
 */
export const ExecuteTopicSchema = z
  .string()
  .regex(
    EXECUTE_TOPIC_REGIX,
    'Invalid execute topic format. Expected: <namespace>.execute.<action>'
  );

/**
 * Regex pattern for semantic versioning validation.
 * Format: x.y.z where x, y, z are non-negative integers
 */
const SEMANTIC_VERSION_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * Shared schema for semantic version validation.
 * Ensures consistent version format across configurations.
 */
export const SemanticVersionSchema = z
  .string()
  .regex(
    SEMANTIC_VERSION_REGEX,
    'Version must follow semantic versioning (x.y.z)'
  );

/**
 * Common validation patterns and constants
 */
export const ValidationPatterns = {
  TOPIC_REGEX,
  SEMANTIC_VERSION_REGEX,
  SUCCESS_TOPIC_REGIX,
  EXECUTE_TOPIC_REGIX,
  FAILURE_TOPIC_REGIX,
} as const;
