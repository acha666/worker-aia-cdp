import { fromBER, Sequence } from "asn1js";
import * as pkijs from "pkijs";
import { describeName } from "../utils/describe";

export function parseCRLDistributionPoints(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const urls = new Set<string>();
    const directoryNames = new Set<string>();
    const distributionPoints: {
      urls: string[];
      directoryNames: string[];
    }[] = [];
    const sequence = asn1.result as Sequence;
    for (const dp of sequence.valueBlock.value) {
      if (!(dp instanceof Sequence)) {
        continue;
      }
      const pointUrls: string[] = [];
      const pointDirectoryNames: string[] = [];
      try {
        const distribution = new pkijs.DistributionPoint({ schema: dp });
        const handleGeneralName = (generalName: pkijs.GeneralName) => {
          if (generalName.type === 6 && typeof generalName.value === "string") {
            pointUrls.push(generalName.value);
            urls.add(generalName.value);
          } else if (
            generalName.type === 4 &&
            generalName.value instanceof pkijs.RelativeDistinguishedNames
          ) {
            const description = describeName(generalName.value);
            pointDirectoryNames.push(description.dn);
            directoryNames.add(description.dn);
          }
        };

        if (Array.isArray(distribution.distributionPoint)) {
          for (const generalName of distribution.distributionPoint) {
            handleGeneralName(generalName);
          }
        } else if (distribution.distributionPoint instanceof pkijs.RelativeDistinguishedNames) {
          const description = describeName(distribution.distributionPoint);
          pointDirectoryNames.push(description.dn);
          directoryNames.add(description.dn);
        }

        if (Array.isArray(distribution.cRLIssuer)) {
          for (const generalName of distribution.cRLIssuer) {
            handleGeneralName(generalName);
          }
        }
      } catch (error) {
        console.warn("crlDistributionPoints distribution parse error", error);
      }
      if (pointUrls.length || pointDirectoryNames.length) {
        distributionPoints.push({
          urls: pointUrls,
          directoryNames: pointDirectoryNames,
        });
      }
    }
    return {
      critical: extension.critical ?? false,
      urls: [...urls],
      directoryNames: [...directoryNames],
      distributionPoints: distributionPoints.length ? distributionPoints : undefined,
    };
  } catch (error) {
    console.warn("crlDistributionPoints parse error", error);
    return undefined;
  }
}
