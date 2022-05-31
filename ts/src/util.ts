/**
 * A utility function to wait the given amount of time.
 *
 * @param milliseconds - The number of milliseconds to wait.
 * @returns A promise that is resolved after the given amount of milliseconds.
 *
 * @public
 */
export const pause = async (milliseconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};
