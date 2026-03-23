import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { isAndroid } from '@/utils/platform';

export function useHeaderSearch() {
  const searchBarRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const closeSearch = useCallback(() => {
    setSearchQuery('');
    Keyboard.dismiss();
    setIsSearchVisible(false);
  }, []);

  const handleOpenSearch = useCallback(() => {
    if (!isSearchVisible) {
      setIsSearchVisible(true);
      requestAnimationFrame(() => {
        setTimeout(() => searchBarRef.current?.focus?.(), 0);
      });
      return;
    }
    searchBarRef.current?.focus?.();
  }, [isSearchVisible]);

  const getHeaderSearchBarOptions = useCallback(
    (placeholder: string) => {
      if (!isAndroid && !isSearchVisible) {
        return undefined;
      }

      return {
        ref: searchBarRef,
        placeholder,
        onChangeText: (event: any) => setSearchQuery(event.nativeEvent.text),
        onCancelButtonPress: closeSearch,
      };
    },
    [closeSearch, isAndroid, isSearchVisible],
  );

  return {
    closeSearch,
    getHeaderSearchBarOptions,
    handleOpenSearch,
    isSearchVisible,
    searchBarRef,
    searchQuery,
    setSearchQuery,
  };
}
