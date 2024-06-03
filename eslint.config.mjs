// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        'rules': {
            'no-console': 0,
            'indent': [
                'error',
                4,
                {
                    'SwitchCase': 1,
                },
            ],
            'quotes': [
                'error',
                'single',
                {
                    'avoidEscape': true,
                },
            ],
            'semi': [
                'error',
                'always',
            ],
            'max-len': [
                'warn',
                120,
            ],
            'comma-dangle': [
                'error',
                {
                    'arrays': 'always-multiline',
                    'objects': 'always-multiline',
                    'imports': 'always-multiline',
                    'exports': 'always-multiline',
                    'functions': 'only-multiline',
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'caughtErrors': 'none',
                },
            ],
        },
    },
);
