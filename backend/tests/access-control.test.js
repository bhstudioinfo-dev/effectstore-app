const assert = require('assert');
const {
    isValidResourceId,
    ownedResourceFilter
} = require('../utils/accessControl');
const effectRoutes = require('../routes/effects');
const tiktokRoutes = require('../routes/tiktok');

const resourceId = '507f1f77bcf86cd799439011';
const userA = '507f191e810c19729de860ea';
const userB = '507f191e810c19729de860eb';

assert.strictEqual(isValidResourceId(resourceId), true);
assert.strictEqual(isValidResourceId('not-an-object-id'), false);
assert.strictEqual(isValidResourceId('507f1f77bcf86cd79943901'), false);

assert.deepStrictEqual(
    ownedResourceFilter(resourceId, userA),
    { _id: resourceId, userId: userA }
);
assert.deepStrictEqual(
    ownedResourceFilter(resourceId, userB, { isTemplate: false }),
    { _id: resourceId, userId: userB, isTemplate: false }
);
assert.notDeepStrictEqual(
    ownedResourceFilter(resourceId, userA),
    ownedResourceFilter(resourceId, userB)
);

const timelineUpdateLayer = effectRoutes.stack.find((layer) =>
    layer.route?.path === '/effects/:id/timeline' && layer.route?.methods?.put
);
assert.ok(timelineUpdateLayer, 'Timeline update route must exist');
const timelineMiddlewareNames = timelineUpdateLayer.route.stack.map((layer) => layer.handle.name);
assert.ok(timelineMiddlewareNames.includes('authMiddleware'), 'Timeline update must require authentication');
assert.ok(timelineMiddlewareNames.includes('adminMiddleware'), 'Timeline update must require admin access');

function routeHandler(router, path, method) {
    const layer = router.stack.find((candidate) => candidate.route?.path === path && candidate.route?.methods?.[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} route must exist`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
}

async function testInvalidIdsAreRejectedBeforeDatabaseQueries() {
    const cases = [
        {
            handler: routeHandler(effectRoutes, '/effects/:id/timeline', 'put'),
            req: { params: { id: 'invalid' }, body: {} },
            expectedError: 'Invalid effect ID'
        },
        {
            handler: routeHandler(tiktokRoutes, '/mappings/:id', 'delete'),
            req: { params: { id: 'invalid' }, userId: userA },
            expectedError: 'Invalid mapping ID'
        },
        {
            handler: routeHandler(tiktokRoutes, '/gift-menu-layout/:layoutId/activate', 'put'),
            req: { params: { layoutId: 'invalid' }, userId: userA },
            expectedError: 'Invalid layout ID'
        }
    ];

    for (const testCase of cases) {
        const res = mockResponse();
        await testCase.handler(testCase.req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.payload.error, testCase.expectedError);
    }
}

testInvalidIdsAreRejectedBeforeDatabaseQueries()
    .then(() => console.log('access-control tests passed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
