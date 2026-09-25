/**
 * Generates a unique numeric project / lead number without "PROJ-" prefix.
 * Finds the highest existing numeric ID and increments it, defaulting to 1001 if no entries exist.
 */
export const generateUniqueProjectNo = (existingList: any[] = []): string => {
  const existingSet = new Set<string>();
  let maxNum = 1000;

  existingList.forEach((item) => {
    const rawVal =
      typeof item === 'string'
        ? item
        : item?.leadNo ||
          item?.lead_no ||
          item?.enquiry_no ||
          item?.enquiryNo ||
          '';

    const val = String(rawVal).trim();
    if (val) {
      existingSet.add(val);

      // Extract any numeric sequence (e.g. "PROJ-1839" -> 1839, "1839" -> 1839)
      const numMatch = val.match(/\d+/g);
      if (numMatch) {
        const parsed = parseInt(numMatch.join(''), 10);
        // Only consider reasonable project numbers (between 1000 and 99999999)
        if (!isNaN(parsed) && parsed >= 1000 && parsed < 100000000) {
          if (parsed > maxNum) maxNum = parsed;
        }
      }
    }
  });

  let candidate = maxNum + 1;
  while (existingSet.has(String(candidate))) {
    candidate++;
  }
  return String(candidate);
};
