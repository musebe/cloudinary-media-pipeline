import "server-only";
import { getConfigurationStatus } from "@/lib/configuration";

export function readConfigurationStatus() {
  return getConfigurationStatus(process.env);
}
