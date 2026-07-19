/*
 * Vendored from @shopify/semaphore 3.1.0:
 * https://github.com/Shopify/quilt/blob/%40shopify/semaphore%403.1.0/packages/semaphore/src/Semaphore.ts
 *
 * MIT License
 *
 * Copyright (c) 2018-present Shopify
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

type ReleaseCallback = () => Promise<unknown>

export class Permit {
  private onRelease: ReleaseCallback
  private isReleased = false

  constructor(onRelease: ReleaseCallback) {
    this.onRelease = onRelease
  }

  async release() {
    if (!this.isReleased) {
      this.isReleased = true
      await this.onRelease()
    }
  }
}

interface Deferred {
  resolve(permit: Permit): void
  promise: Promise<Permit>
}

export class Semaphore {
  private availablePermits: number
  private deferreds: Deferred[] = []

  constructor(count: number) {
    this.availablePermits = count
  }

  acquire(): Promise<Permit> {
    if (this.availablePermits > 0) {
      return Promise.resolve(this.createPermit())
    } else {
      const deferred = {} as Deferred
      deferred.promise = new Promise((resolve) => {
        deferred.resolve = resolve
      })
      this.deferreds.push(deferred)
      return deferred.promise
    }
  }

  private createPermit(): Permit {
    this.availablePermits--

    return new Permit(async (): Promise<void> => {
      this.availablePermits++

      if (this.deferreds.length > 0) {
        const deferred = this.deferreds.shift()
        if (deferred) {
          deferred.resolve(this.createPermit())
          await deferred.promise
        }
      }
    })
  }
}
